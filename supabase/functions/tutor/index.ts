// CloudQuest AZ-900 · AI study buddy (Supabase Edge Function).
//
// Required secrets (set with `supabase secrets set NAME=value`, never in the app):
//   ANTHROPIC_API_KEY   your provider key
//   AI_MODEL            the model name you choose from the provider's current model list
// Supabase provides SUPABASE_URL, SUPABASE_ANON_KEY and SUPABASE_SERVICE_ROLE_KEY automatically.
//
// Each request: checks the learner is signed in, consumes one of their daily messages (atomically),
// sends the conversation to the provider with the tutor rules, then saves both messages.
// A message counts toward the daily limit even if the provider later fails.

import { createClient } from 'npm:@supabase/supabase-js@2';
import { DAILY_LIMIT, boundHistory, buildSystemPrompt, validateChatBody, type ChatTurn } from './prompt.ts';

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json' } });

async function callProvider(apiKey: string, model: string, system: string, messages: ChatTurn[]): Promise<string> {
  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: { 'x-api-key': apiKey, 'anthropic-version': '2023-06-01', 'content-type': 'application/json' },
    body: JSON.stringify({ model, max_tokens: 800, system, messages }),
  });
  if (!res.ok) throw new Error(`provider responded ${res.status}`);
  const data = (await res.json()) as { content?: { type: string; text?: string }[] };
  const text = (data.content ?? [])
    .filter((b) => b.type === 'text' && typeof b.text === 'string')
    .map((b) => b.text as string)
    .join('\n')
    .trim();
  if (!text) throw new Error('provider returned no text');
  return text.slice(0, 11000);
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  if (req.method !== 'POST') return json(405, { error: 'Use POST.' });

  const url = Deno.env.get('SUPABASE_URL') ?? '';
  const anon = Deno.env.get('SUPABASE_ANON_KEY') ?? '';
  const service = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
  const apiKey = Deno.env.get('ANTHROPIC_API_KEY');
  const model = Deno.env.get('AI_MODEL');
  if (!apiKey || !model) return json(503, { error: 'The tutor is not configured yet. Ask the project owner to add the AI key.' });

  const userClient = createClient(url, anon, {
    global: { headers: { Authorization: req.headers.get('Authorization') ?? '' } },
    auth: { persistSession: false },
  });
  const { data: userData, error: userError } = await userClient.auth.getUser();
  if (userError || !userData.user) return json(401, { error: 'Log in to use the tutor.' });
  const userId = userData.user.id;

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return json(400, { error: 'Send your message as JSON.' });
  }
  const input = validateChatBody(body);
  if (!input.ok) return json(400, { error: input.error });

  const admin = createClient(url, service, { auth: { persistSession: false } });

  const { data: allowed, error: limitError } = await admin.rpc('consume_ai_message', {
    p_user_id: userId,
    p_daily_limit: DAILY_LIMIT,
  });
  if (limitError) return json(500, { error: 'The tutor could not check your daily limit. Try again shortly.' });
  if (!allowed) return json(429, { error: `You have used today's ${DAILY_LIMIT} tutor messages. Come back tomorrow.` });

  let conversationId = input.conversationId;
  let history: ChatTurn[] = [];
  if (conversationId) {
    // RLS: a learner can only see their own conversations, so this also checks ownership.
    const { data: conversation } = await userClient.from('ai_conversations').select('id').eq('id', conversationId).maybeSingle();
    if (!conversation) return json(404, { error: 'That conversation was not found.' });
    const { data: rows } = await userClient
      .from('ai_messages')
      .select('role, content')
      .eq('conversation_id', conversationId)
      .order('created_at', { ascending: false })
      .limit(10);
    history = ((rows ?? []) as ChatTurn[]).reverse();
  }

  const { data: profile } = await userClient
    .from('profiles')
    .select('explanation_style, local_examples')
    .eq('id', userId)
    .maybeSingle();
  const system = buildSystemPrompt({
    localExamples: profile?.local_examples ?? true,
    style: profile?.explanation_style === 'detailed' ? 'detailed' : 'simple',
  });
  const turns = boundHistory([...history, { role: 'user', content: input.message }]);

  let reply: string;
  try {
    reply = await callProvider(apiKey, model, system, turns);
  } catch (err) {
    console.error('tutor provider error:', err instanceof Error ? err.message : err);
    return json(502, { error: 'The tutor is unavailable right now. Please try again in a moment.' });
  }

  if (!conversationId) {
    const { data: created, error: createError } = await admin
      .from('ai_conversations')
      .insert({ user_id: userId, title: input.message.slice(0, 60) })
      .select('id')
      .single();
    if (createError || !created) return json(500, { error: 'The conversation could not be saved. Try again.' });
    conversationId = created.id as string;
  } else {
    await admin.from('ai_conversations').update({ updated_at: new Date().toISOString() }).eq('id', conversationId);
  }

  const { error: saveError } = await admin.from('ai_messages').insert([
    { conversation_id: conversationId, user_id: userId, role: 'user', content: input.message },
    { conversation_id: conversationId, user_id: userId, role: 'assistant', content: reply },
  ]);
  if (saveError) console.error('tutor save error:', saveError.message);

  await admin.from('activity_log').insert({ user_id: userId, kind: 'ai_chat', ref_id: conversationId });

  return json(200, { conversation_id: conversationId, reply });
});