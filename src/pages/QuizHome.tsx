import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { Alert, Button, Card, Spinner, ToggleChip } from '../components/ui';
import { fetchQuestionCatalog, fetchRecentAttempts, fetchTopics, startQuiz } from '../lib/quizApi';
import { COUNT_CHOICES, DIFFICULTIES, availableCount, difficultyLabel, effectiveCount } from '../lib/quizLogic';
import type { CatalogQuestion, Difficulty, FeedbackMode, RecentAttempt, TopicSummary } from '../lib/quizTypes';

function ChoiceCard({
  name,
  checked,
  onChange,
  title,
  detail,
  meta,
}: {
  name: string;
  checked: boolean;
  onChange: () => void;
  title: string;
  detail: string;
  meta?: string;
}) {
  return (
    <label
      className={`flex cursor-pointer items-start gap-3 rounded-2xl border p-4 transition-colors focus-within:ring-2 focus-within:ring-forest ${
        checked ? 'border-forest bg-white ring-2 ring-forest/30' : 'border-forest/15 bg-white hover:bg-mist'
      }`}
    >
      <input type="radio" className="sr-only" name={name} checked={checked} onChange={onChange} />
      <span
        aria-hidden
        className={`mt-1 h-4 w-4 shrink-0 rounded-full border-2 ${
          checked ? 'border-forest bg-forest ring-2 ring-inset ring-white' : 'border-forest/40'
        }`}
      />
      <span className="min-w-0 flex-1">
        <span className="block font-semibold text-forest">{title}</span>
        <span className="block text-sm text-muted">{detail}</span>
      </span>
      {meta && <span className="shrink-0 text-sm font-semibold text-forest">{meta}</span>}
    </label>
  );
}

export default function QuizHome() {
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const presetSlug = params.get('topic');

  const [topics, setTopics] = useState<TopicSummary[] | null>(null);
  const [catalog, setCatalog] = useState<CatalogQuestion[]>([]);
  const [recent, setRecent] = useState<RecentAttempt[]>([]);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);

  const [scope, setScope] = useState<string>('mixed'); // 'mixed' or a topic id
  const [difficulty, setDifficulty] = useState<Difficulty | null>(null);
  const [count, setCount] = useState<number>(10);
  const [feedback, setFeedback] = useState<FeedbackMode>('instant');
  const [starting, setStarting] = useState(false);
  const [startError, setStartError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    setLoadError(null);
    Promise.all([fetchTopics(), fetchQuestionCatalog(), fetchRecentAttempts(5)])
      .then(([t, c, r]) => {
        if (!active) return;
        setTopics(t);
        setCatalog(c);
        setRecent(r);
        const preset = presetSlug ? t.find((topic) => topic.slug === presetSlug) : undefined;
        if (preset) setScope(preset.id);
      })
      .catch((err: unknown) => {
        if (active) setLoadError(err instanceof Error ? err.message : 'Could not load the quiz options.');
      });
    return () => {
      active = false;
    };
  }, [reloadKey, presetSlug]);

  const topicId = scope === 'mixed' ? null : scope;
  const available = useMemo(() => availableCount(catalog, topicId, difficulty), [catalog, topicId, difficulty]);
  const willUse = effectiveCount(count, available);
  const topicTitle = (id: string | null) => topics?.find((t) => t.id === id)?.title ?? 'Mixed topics';

  function chooseScope(next: string) {
    setScope(next);
    const nextTopic = next === 'mixed' ? null : next;
    if (difficulty !== null && availableCount(catalog, nextTopic, difficulty) === 0) setDifficulty(null);
  }

  async function start() {
    setStarting(true);
    setStartError(null);
    try {
      const attemptId = await startQuiz({
        mode: topicId === null ? 'mixed' : 'topic',
        topicId,
        difficulty,
        count,
        feedback,
      });
      navigate(`/quiz/${attemptId}`);
    } catch (err) {
      setStartError(err instanceof Error ? err.message : 'Could not start the quiz.');
      setStarting(false);
    }
  }

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <header>
        <h1 className="text-2xl font-bold text-forest sm:text-3xl">Practice quizzes</h1>
        <p className="mt-1 text-muted">
          Original questions written for learning, grouped by the AZ-900 skill areas. They are not real exam questions.
        </p>
      </header>

      {loadError && (
        <Alert tone="error">
          <p>{loadError}</p>
          <div className="mt-3">
            <Button variant="soft" onClick={() => setReloadKey((k) => k + 1)}>
              Try again
            </Button>
          </div>
        </Alert>
      )}
      {!topics && !loadError && <Spinner label="Loading quiz options" />}

      {topics && (
        <>
          <Card>
            <fieldset>
              <legend className="text-lg font-bold text-forest">1. What do you want to practise?</legend>
              <div className="mt-4 space-y-3">
                <ChoiceCard
                  name="scope"
                  checked={scope === 'mixed'}
                  onChange={() => chooseScope('mixed')}
                  title="Mixed topics"
                  detail="A blend from every skill area"
                  meta={`${availableCount(catalog, null, difficulty)} questions`}
                />
                {topics.map((t) => (
                  <ChoiceCard
                    key={t.id}
                    name="scope"
                    checked={scope === t.id}
                    onChange={() => chooseScope(t.id)}
                    title={t.title}
                    detail={`${t.weight_min}–${t.weight_max}% of the exam`}
                    meta={`${availableCount(catalog, t.id, difficulty)} questions`}
                  />
                ))}
              </div>
            </fieldset>
          </Card>

          <Card>
            <fieldset>
              <legend className="text-lg font-bold text-forest">2. Difficulty</legend>
              <div className="mt-4 flex flex-wrap gap-2">
                <ToggleChip pressed={difficulty === null} onClick={() => setDifficulty(null)}>
                  Any
                </ToggleChip>
                {DIFFICULTIES.map((d) => {
                  const n = availableCount(catalog, topicId, d);
                  return (
                    <span key={d} className={n === 0 ? 'pointer-events-none opacity-50' : ''}>
                      <ToggleChip pressed={difficulty === d} onClick={() => setDifficulty(d)}>
                        {difficultyLabel(d)} ({n})
                      </ToggleChip>
                    </span>
                  );
                })}
              </div>
            </fieldset>

            <fieldset className="mt-6">
              <legend className="text-lg font-bold text-forest">3. How many questions?</legend>
              <div className="mt-4 flex flex-wrap gap-2">
                {COUNT_CHOICES.map((n) => (
                  <ToggleChip key={n} pressed={count === n} onClick={() => setCount(n)}>
                    {n}
                  </ToggleChip>
                ))}
              </div>
              {available > 0 && willUse < count && (
                <p className="mt-2 text-sm text-muted">
                  Only {available} {available === 1 ? 'question matches' : 'questions match'}, so this quiz will use {willUse}.
                </p>
              )}
            </fieldset>
          </Card>

          <Card>
            <fieldset>
              <legend className="text-lg font-bold text-forest">4. When do you want feedback?</legend>
              <div className="mt-4 space-y-3">
                <ChoiceCard
                  name="feedback"
                  checked={feedback === 'instant'}
                  onChange={() => setFeedback('instant')}
                  title="After each question"
                  detail="Check your answer and read the explanation straight away. Best for learning."
                />
                <ChoiceCard
                  name="feedback"
                  checked={feedback === 'end'}
                  onChange={() => setFeedback('end')}
                  title="At the end"
                  detail="Answer everything first, then review. Closer to exam conditions."
                />
              </div>
            </fieldset>
          </Card>

          {startError && <Alert tone="error">{startError}</Alert>}
          {available === 0 && <Alert tone="info">No questions match this combination. Try another topic or difficulty.</Alert>}
          <Button full loading={starting} disabled={willUse === 0} onClick={() => void start()}>
            Start quiz{willUse > 0 ? ` · ${willUse} ${willUse === 1 ? 'question' : 'questions'}` : ''}
          </Button>

          <Card>
            <h2 className="text-lg font-bold text-forest">Recent quizzes</h2>
            {recent.length === 0 ? (
              <p className="mt-2 text-sm text-muted">You have not completed a quiz yet. Your results will be saved here.</p>
            ) : (
              <ul className="mt-3 divide-y divide-forest/10">
                {recent.map((a) => (
                  <li key={a.id}>
                    <Link
                      to={`/quiz/${a.id}/results`}
                      className="flex items-center justify-between gap-3 py-3 text-sm hover:text-forest"
                    >
                      <span className="min-w-0">
                        <span className="block truncate font-semibold text-forest">{topicTitle(a.topic_id)}</span>
                        <span className="block text-muted">
                          {difficultyLabel(a.difficulty)}
                          {a.completed_at ? ` · ${new Date(a.completed_at).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}` : ''}
                        </span>
                      </span>
                      <span className="shrink-0 font-bold text-forest">
                        {a.correct_count ?? 0}/{a.question_count}
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </>
      )}
    </div>
  );
}
