import { useEffect, useRef, useState, type KeyboardEvent } from 'react';
import { Alert, Button, Card, Spinner } from '../components/ui';
import { fetchLatestConversation, fetchMessages, sendTutorMessage, type ChatMessage } from '../lib/stage3Api';

const MAX_CHARS = 2000;
const SUGGESTIONS = [
  'Explain availability zones with a simple everyday example',
  'What is the difference between IaaS, PaaS and SaaS?',
  'Give me one original practice question on storage. Do not show the answer yet.',
  'Why is a resource group not the same as a subscription?',
];

const message = (err: unknown) => (err instanceof Error ? err.message : 'Something went wrong. Please try again.');

export default function Tutor() {
  const [conversationId, setConversationId] = useState<string | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [input, setInput] = useState('');
  const [sending, setSending] = useState(false);
  const [sendError, setSendError] = useState<string | null>(null);
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let active = true;
    (async () => {
      try {
        const latest = await fetchLatestConversation();
        if (!active || !latest) return;
        setConversationId(latest.id);
        setMessages(await fetchMessages(latest.id));
      } catch (err) {
        if (active) setLoadError(message(err));
      } finally {
        if (active) setLoading(false);
      }
    })();
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    endRef.current?.scrollIntoView?.({ behavior: 'smooth', block: 'end' });
  }, [messages, sending]);

  async function send(text: string) {
    const content = text.trim();
    if (!content || sending) return;
    setSending(true);
    setSendError(null);
    setInput('');
    const pending: ChatMessage = { id: `pending-${Date.now()}`, role: 'user', content, created_at: new Date().toISOString() };
    setMessages((m) => [...m, pending]);
    try {
      const res = await sendTutorMessage(conversationId, content);
      setConversationId(res.conversation_id);
      setMessages(await fetchMessages(res.conversation_id));
    } catch (err) {
      setMessages((m) => m.filter((x) => x.id !== pending.id));
      setInput(content);
      setSendError(message(err));
    } finally {
      setSending(false);
    }
  }

  function onKey(e: KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      void send(input);
    }
  }

  function newChat() {
    setConversationId(null);
    setMessages([]);
    setSendError(null);
  }

  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-5">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-forest sm:text-3xl">Study buddy</h1>
          <p className="mt-1 text-muted">Ask about any AZ-900 topic. Simple explanations, one step at a time.</p>
        </div>
        <Button variant="soft" onClick={newChat} disabled={sending || messages.length === 0}>
          New chat
        </Button>
      </header>

      <Alert tone="info">
        The study buddy can make mistakes and is not an official Microsoft tool. Check important points on Microsoft Learn before you rely on them.
      </Alert>

      {loading && <Spinner label="Loading your conversation" />}
      {loadError && <Alert tone="error">{loadError}</Alert>}

      {!loading && messages.length === 0 && !loadError && (
        <Card>
          <p className="font-semibold text-forest">What would you like to understand?</p>
          <p className="mt-1 text-sm text-muted">Try one of these, or type your own question.</p>
          <div className="mt-4 grid gap-2 sm:grid-cols-2">
            {SUGGESTIONS.map((s) => (
              <button
                key={s}
                type="button"
                disabled={sending}
                onClick={() => void send(s)}
                className="rounded-2xl border border-forest/15 bg-white px-4 py-3 text-left text-sm text-forest transition-colors hover:bg-mist disabled:opacity-60"
              >
                {s}
              </button>
            ))}
          </div>
        </Card>
      )}

      {messages.length > 0 && (
        <ol className="space-y-3" aria-live="polite">
          {messages.map((m) => (
            <li key={m.id} className={`flex ${m.role === 'user' ? 'justify-end' : 'justify-start'}`}>
              <div
                className={`max-w-[85%] whitespace-pre-wrap rounded-3xl px-4 py-3 text-[15px] leading-relaxed sm:max-w-[75%] ${
                  m.role === 'user' ? 'bg-forest text-white' : 'bg-white text-ink shadow-card'
                }`}
              >
                <span className="sr-only">{m.role === 'user' ? 'You: ' : 'Study buddy: '}</span>
                {m.content}
              </div>
            </li>
          ))}
          {sending && (
            <li className="flex justify-start">
              <div className="rounded-3xl bg-white px-4 py-3 text-sm text-muted shadow-card">Thinking…</div>
            </li>
          )}
        </ol>
      )}
      <div ref={endRef} />

      {sendError && <Alert tone="error">{sendError}</Alert>}

      <form
        onSubmit={(e) => {
          e.preventDefault();
          void send(input);
        }}
        className="sticky bottom-24 flex items-end gap-2 rounded-3xl bg-white p-2 shadow-card lg:bottom-4"
      >
        <label htmlFor="tutor-input" className="sr-only">
          Message the study buddy
        </label>
        <textarea
          id="tutor-input"
          rows={2}
          maxLength={MAX_CHARS}
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={onKey}
          placeholder="Ask about a topic…"
          disabled={sending}
          className="min-h-[3rem] flex-1 resize-none rounded-2xl bg-transparent px-3 py-2 text-[15px] text-ink placeholder:text-muted focus:outline-none"
        />
        <Button type="submit" loading={sending} disabled={!input.trim()}>
          Send
        </Button>
      </form>
      <p className="text-right text-xs text-muted">{input.length}/{MAX_CHARS}</p>
    </div>
  );
}
