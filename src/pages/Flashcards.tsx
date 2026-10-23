import { useEffect, useMemo, useState } from 'react';
import { Alert, Button, Card, Spinner, ToggleChip, buttonClass } from '../components/ui';
import { Link } from 'react-router-dom';
import { fetchBrowseCards, fetchReviewQueue, rateCard, type BrowseCard, type QueueCard } from '../lib/stage3Api';

type Rating = 0 | 1 | 2 | 3;
const RATINGS: { value: Rating; label: string; hint: string }[] = [
  { value: 0, label: 'Again', hint: 'Back in 10 minutes' },
  { value: 1, label: 'Hard', hint: 'Sooner than usual' },
  { value: 2, label: 'Good', hint: 'Normal spacing' },
  { value: 3, label: 'Easy', hint: 'Spaced further out' },
];

const message = (err: unknown) => (err instanceof Error ? err.message : 'Something went wrong. Please try again.');

export default function Flashcards() {
  const [tab, setTab] = useState<'review' | 'browse'>('review');
  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <header>
        <h1 className="text-2xl font-bold text-forest sm:text-3xl">Flashcards</h1>
        <p className="mt-1 text-muted">Short prompts that come back just before you would forget them. Rate how well you knew each one.</p>
      </header>
      <div className="flex gap-2" role="tablist" aria-label="Flashcard views">
        <ToggleChip pressed={tab === 'review'} onClick={() => setTab('review')}>
          Review
        </ToggleChip>
        <ToggleChip pressed={tab === 'browse'} onClick={() => setTab('browse')}>
          Browse all
        </ToggleChip>
      </div>
      {tab === 'review' ? <ReviewPanel /> : <BrowsePanel />}
    </div>
  );
}

function ReviewPanel() {
  const [queue, setQueue] = useState<QueueCard[] | null>(null);
  const [index, setIndex] = useState(0);
  const [revealed, setRevealed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [reviewed, setReviewed] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    let active = true;
    setError(null);
    fetchReviewQueue(30)
      .then((q) => {
        if (!active) return;
        setQueue(q);
        setIndex(0);
        setRevealed(false);
      })
      .catch((err: unknown) => {
        if (active) setError(message(err));
      });
    return () => {
      active = false;
    };
  }, [reloadKey]);

  if (error) {
    return (
      <Alert tone="error">
        <p>{error}</p>
        <div className="mt-3">
          <Button variant="soft" onClick={() => setReloadKey((k) => k + 1)}>
            Try again
          </Button>
        </div>
      </Alert>
    );
  }
  if (!queue) return <Spinner label="Loading your cards" />;

  const card = queue[index];
  if (!card) {
    return (
      <Card className="text-center">
        <h2 className="text-xl font-bold text-forest">{reviewed > 0 ? 'You are caught up for now' : 'Nothing due right now'}</h2>
        <p className="mt-2 text-sm text-muted">
          {reviewed > 0
            ? `You reviewed ${reviewed} ${reviewed === 1 ? 'card' : 'cards'}. Cards you rated Again return in about 10 minutes, and the rest on their scheduled days.`
            : 'Cards appear here as they come due. Check back later.'}
        </p>
        <div className="mt-5 flex flex-wrap justify-center gap-3">
          <Button variant="soft" onClick={() => setReloadKey((k) => k + 1)}>
            Check again
          </Button>
          <Link to="/quiz" className={buttonClass('primary')}>
            Take a quiz
          </Link>
        </div>
      </Card>
    );
  }

  async function rate(rating: Rating) {
    setBusy(true);
    setError(null);
    try {
      await rateCard(card.flashcard_id, rating);
      setReviewed((n) => n + 1);
      setRevealed(false);
      setIndex((i) => i + 1);
    } catch (err) {
      setError(message(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card>
      <div className="flex flex-wrap items-center justify-between gap-2 text-sm">
        <p className="font-semibold text-forest">
          Card {index + 1} of {queue.length}
        </p>
        <p className="text-muted">
          {card.is_new ? 'New' : `Review · seen ${card.repetitions} ${card.repetitions === 1 ? 'time' : 'times'}`}
        </p>
      </div>
      <p className="mt-5 text-xs font-bold uppercase tracking-wide text-muted">
        {card.topic_title} · {card.subtopic_title}
      </p>
      <p className="mt-2 text-xl font-bold leading-snug text-forest">{card.front}</p>

      {!revealed ? (
        <div className="mt-6">
          <Button full onClick={() => setRevealed(true)}>
            Show answer
          </Button>
        </div>
      ) : (
        <div className="mt-6 space-y-5">
          <div className="rounded-2xl bg-mist p-4">
            <p className="text-[15px] leading-relaxed text-ink">{card.back}</p>
            {card.example && <p className="mt-3 text-sm text-muted">Example: {card.example}</p>}
            {card.reference_url && (
              <a
                href={card.reference_url}
                target="_blank"
                rel="noreferrer"
                className="mt-3 inline-block text-sm font-semibold text-forest underline underline-offset-2"
              >
                Read more on Microsoft Learn
              </a>
            )}
          </div>
          <div>
            <p className="mb-2 text-sm font-semibold text-forest">How well did you know it?</p>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
              {RATINGS.map((r) => (
                <button
                  key={r.value}
                  type="button"
                  disabled={busy}
                  onClick={() => void rate(r.value)}
                  className={`flex flex-col items-center rounded-2xl border px-2 py-3 text-center transition-colors disabled:opacity-60 ${
                    r.value === 0
                      ? 'border-gold bg-gold-soft text-forest hover:brightness-95'
                      : r.value === 3
                        ? 'border-lime bg-lime text-forest hover:brightness-95'
                        : 'border-forest/15 bg-white text-forest hover:bg-mist'
                  }`}
                >
                  <span className="font-bold">{r.label}</span>
                  <span className="mt-0.5 text-xs text-muted">{r.hint}</span>
                </button>
              ))}
            </div>
          </div>
        </div>
      )}
      {error && (
        <div className="mt-4">
          <Alert tone="error">{error}</Alert>
        </div>
      )}
    </Card>
  );
}

function BrowsePanel() {
  const [cards, setCards] = useState<BrowseCard[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [topic, setTopic] = useState<string>('All');

  useEffect(() => {
    let active = true;
    fetchBrowseCards()
      .then((c) => {
        if (active) setCards(c);
      })
      .catch((err: unknown) => {
        if (active) setError(message(err));
      });
    return () => {
      active = false;
    };
  }, []);

  const topics = useMemo(() => [...new Set((cards ?? []).map((c) => c.subtopics.topics.title))], [cards]);
  if (error) return <Alert tone="error">{error}</Alert>;
  if (!cards) return <Spinner label="Loading cards" />;

  const shown = topic === 'All' ? cards : cards.filter((c) => c.subtopics.topics.title === topic);
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-2">
        {['All', ...topics].map((t) => (
          <ToggleChip key={t} pressed={topic === t} onClick={() => setTopic(t)}>
            {t}
          </ToggleChip>
        ))}
      </div>
      <ul className="space-y-3">
        {shown.map((c) => (
          <li key={c.id}>
            <details className="rounded-3xl bg-white shadow-card">
              <summary className="cursor-pointer p-4 sm:p-5">
                <span className="block text-xs text-muted">{c.subtopics.title}</span>
                <span className="block font-semibold leading-snug text-forest">{c.front}</span>
              </summary>
              <div className="space-y-3 px-4 pb-5 sm:px-5">
                <p className="text-[15px] leading-relaxed text-ink">{c.back}</p>
                {c.example && <p className="text-sm text-muted">Example: {c.example}</p>}
                {c.reference_url && (
                  <a href={c.reference_url} target="_blank" rel="noreferrer" className="text-sm font-semibold text-forest underline underline-offset-2">
                    Read more on Microsoft Learn
                  </a>
                )}
              </div>
            </details>
          </li>
        ))}
      </ul>
    </div>
  );
}
