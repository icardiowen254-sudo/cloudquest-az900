import { friendlyDbError, friendlyQuizError } from './errors';
import type { PlanResult, PlannedSession } from './studyPlan';
import { toSavePayload } from './studyPlan';
import { supabase } from './supabase';

export interface QueueCard {
  flashcard_id: string;
  topic_title: string;
  subtopic_title: string;
  front: string;
  back: string;
  example: string | null;
  reference_url: string | null;
  is_new: boolean;
  due_at: string;
  repetitions: number;
}

export interface BrowseCard {
  id: string;
  front: string;
  back: string;
  example: string | null;
  reference_url: string | null;
  subtopics: { title: string; topics: { title: string } };
}

export interface PlanRow {
  id: string;
  exam_date: string;
  weekly_hours: number;
  study_days: number[];
  generated_at: string;
}

export interface SessionRow {
  id: string;
  scheduled_for: string;
  kind: string;
  title: string;
  planned_minutes: number;
  status: 'pending' | 'completed' | 'skipped';
  rescheduled_from: string | null;
  topic_id: string | null;
}

export interface PlanSubtopicRow {
  id: string;
  topic_id: string;
  title: string;
  topics: { title: string; weight_min: number; weight_max: number };
}

export interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  created_at: string;
}

const dbError = (message: string) => new Error(friendlyDbError(message));

// ── Flashcards ───────────────────────────────────────────────────────────
export async function fetchReviewQueue(limit = 30): Promise<QueueCard[]> {
  const { data, error } = await supabase.rpc('get_review_queue', { p_limit: limit });
  if (error) throw dbError(error.message);
  return (data ?? []) as QueueCard[];
}

export async function rateCard(flashcardId: string, rating: 0 | 1 | 2 | 3): Promise<{ interval_days: number; due_at: string }> {
  const { data, error } = await supabase.rpc('review_flashcard', { p_flashcard_id: flashcardId, p_rating: rating });
  if (error) throw new Error(friendlyQuizError(error.message));
  return data as { interval_days: number; due_at: string };
}

export async function fetchBrowseCards(): Promise<BrowseCard[]> {
  const { data, error } = await supabase
    .from('flashcards')
    .select('id, front, back, example, reference_url, subtopics(title, topics(title))')
    .order('front');
  if (error) throw dbError(error.message);
  return data as unknown as BrowseCard[];
}

// ── Study plan ───────────────────────────────────────────────────────────
export async function fetchActivePlan(): Promise<PlanRow | null> {
  const { data, error } = await supabase
    .from('study_plans')
    .select('id, exam_date, weekly_hours, study_days, generated_at')
    .eq('status', 'active')
    .maybeSingle();
  if (error) throw dbError(error.message);
  return data as PlanRow | null;
}

export async function fetchSessions(planId: string): Promise<SessionRow[]> {
  const { data, error } = await supabase
    .from('study_sessions')
    .select('id, scheduled_for, kind, title, planned_minutes, status, rescheduled_from, topic_id')
    .eq('plan_id', planId)
    .order('scheduled_for')
    .order('id');
  if (error) throw dbError(error.message);
  return data as SessionRow[];
}

export async function fetchPlanSubtopics(): Promise<PlanSubtopicRow[]> {
  const { data, error } = await supabase
    .from('subtopics')
    .select('id, topic_id, title, topics(title, weight_min, weight_max)')
    .order('sort_order');
  if (error) throw dbError(error.message);
  return data as unknown as PlanSubtopicRow[];
}

export async function fetchSubtopicCount(): Promise<number> {
  const { count, error } = await supabase.from('subtopics').select('id', { count: 'exact', head: true });
  if (error) throw dbError(error.message);
  return count ?? 0;
}

export async function savePlan(examDate: string, weeklyHours: number, studyDays: number[], sessions: PlannedSession[]): Promise<string> {
  const { data, error } = await supabase.rpc('save_study_plan', {
    p_exam_date: examDate,
    p_weekly_hours: weeklyHours,
    p_study_days: studyDays,
    p_sessions: toSavePayload(sessions),
  });
  if (error) throw new Error(friendlyQuizError(error.message));
  return data as string;
}

export async function updateSessionStatus(id: string, status: 'pending' | 'completed' | 'skipped'): Promise<void> {
  const { error } = await supabase
    .from('study_sessions')
    .update({ status, completed_at: status === 'completed' ? new Date().toISOString() : null })
    .eq('id', id);
  if (error) throw dbError(error.message);
}

export async function moveSession(id: string, originalDate: string, newDate: string): Promise<void> {
  const { error } = await supabase
    .from('study_sessions')
    .update({ scheduled_for: newDate, rescheduled_from: originalDate })
    .eq('id', id);
  if (error) throw dbError(error.message);
}

// ── Tutor ────────────────────────────────────────────────────────────────
export async function fetchLatestConversation(): Promise<{ id: string; title: string } | null> {
  const { data, error } = await supabase
    .from('ai_conversations')
    .select('id, title')
    .order('updated_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw dbError(error.message);
  return data as { id: string; title: string } | null;
}

export async function fetchMessages(conversationId: string): Promise<ChatMessage[]> {
  const { data, error } = await supabase
    .from('ai_messages')
    .select('id, role, content, created_at')
    .eq('conversation_id', conversationId)
    .order('created_at');
  if (error) throw dbError(error.message);
  return data as ChatMessage[];
}

export async function sendTutorMessage(conversationId: string | null, message: string): Promise<{ conversation_id: string; reply: string }> {
  const { data, error } = await supabase.functions.invoke('tutor', {
    body: conversationId ? { conversation_id: conversationId, message } : { message },
  });
  if (error) {
    let text = 'The tutor is unavailable right now. Please try again in a moment.';
    try {
      const body = (await (error as unknown as { context: Response }).context.json()) as { error?: string };
      if (body.error) text = body.error;
    } catch {
      /* keep the generic message */
    }
    throw new Error(text);
  }
  return data as { conversation_id: string; reply: string };
}

export type { PlanResult };
