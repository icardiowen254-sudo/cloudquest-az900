import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { CheckCircle2, RotateCcw, XCircle } from 'lucide-react';
import { ExplanationPanel, OptionList } from '../components/OptionList';
import { Alert, Button, Card, Spinner, ToggleChip, buttonClass } from '../components/ui';
import { loadResult, startQuiz } from '../lib/quizApi';
import { accuracy, difficultyLabel, percentLabel, resultByTopic } from '../lib/quizLogic';
import type { AttemptResult } from '../lib/quizTypes';

export default function QuizResults() {
  const { attemptId } = useParams();
  const navigate = useNavigate();
  const [result, setResult] = useState<AttemptResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<'all' | 'missed'>('all');
  const [retaking, setRetaking] = useState(false);
  const [retryError, setRetryError] = useState<string | null>(null);

  useEffect(() => {
    if (!attemptId) {
      setError('That results address is not valid.');
      return;
    }
    let active = true;
    loadResult(attemptId)
      .then((r) => {
        if (active) setResult(r);
      })
      .catch((err: unknown) => {
        if (active) setError(err instanceof Error ? err.message : 'Could not load these results.');
      });
    return () => {
      active = false;
    };
  }, [attemptId]);

  if (error) {
    return (
      <div className="mx-auto max-w-3xl space-y-4">
        <Alert tone="error">{error}</Alert>
        <Link to="/quiz" className="inline-block text-sm font-semibold text-forest underline underline-offset-2">
          Back to quizzes
        </Link>
      </div>
    );
  }
  if (!result) {
    return (
      <div className="mx-auto max-w-3xl">
        <Spinner label="Loading your results" />
      </div>
    );
  }

  const { attempt, answers } = result;
  const total = attempt.question_count;
  const correct = attempt.correct_count;
  const ratio = accuracy(correct, total);
  const missed = answers.filter((a) => !a.is_correct);
  const skipped = answers.filter((a) => a.selected_option_ids.length === 0).length;
  const shown = filter === 'missed' ? missed : answers;
  const byTopic = resultByTopic(answers);
  const title = attempt.mode === 'topic' ? (answers[0]?.topic_title ?? 'Topic quiz') : 'Mixed topics';

  async function retake() {
    setRetaking(true);
    setRetryError(null);
    try {
      const id = await startQuiz({
        mode: attempt.mode,
        topicId: attempt.topic_id,
        difficulty: attempt.difficulty,
        count: attempt.question_count,
        feedback: attempt.feedback,
      });
      navigate(`/quiz/${id}`);
    } catch (err) {
      setRetryError(err instanceof Error ? err.message : 'Could not start a new quiz.');
      setRetaking(false);
    }
  }

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <header>
        <h1 className="text-2xl font-bold text-forest sm:text-3xl">Quiz results</h1>
        <p className="mt-1 text-muted">
          {title} · {difficultyLabel(attempt.difficulty)} · {attempt.feedback === 'instant' ? 'Feedback after each question' : 'Feedback at the end'}
        </p>
      </header>

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="rounded-3xl bg-forest p-5 text-white">
          <p className="text-sm font-semibold">Practice score</p>
          <p className="mt-2 text-5xl font-bold tracking-tight">
            {correct}/{total}
          </p>
          <p className="mt-1 text-sm text-white/80">{percentLabel(ratio)} correct</p>
        </div>
        <div className="rounded-3xl bg-gold p-5 text-forest">
          <p className="text-sm font-semibold">To review</p>
          <p className="mt-2 text-5xl font-bold tracking-tight">{missed.length}</p>
          <p className="mt-1 text-sm font-medium">
            {missed.length === 0 ? 'No missed questions. Nicely done.' : `Missed${skipped > 0 ? `, including ${skipped} unanswered` : ''}`}
          </p>
        </div>
      </div>

      <Alert tone="info">
        This is practice performance on a small set of questions. It does not predict your result on the real exam.
      </Alert>

      {byTopic.length > 1 && (
        <Card>
          <h2 className="text-lg font-bold text-forest">By skill area</h2>
          <ul className="mt-4 space-y-4">
            {byTopic.map((t) => {
              const pct = Math.round((t.correct / t.total) * 100);
              return (
                <li key={t.topicTitle}>
                  <div className="flex items-baseline justify-between gap-3 text-sm">
                    <span className="font-semibold text-forest">{t.topicTitle}</span>
                    <span className="shrink-0 text-muted">
                      {t.correct}/{t.total}
                    </span>
                  </div>
                  <div
                    role="img"
                    aria-label={`${t.topicTitle}: ${t.correct} of ${t.total} correct`}
                    className="mt-2 h-3 overflow-hidden rounded-full bg-mist"
                  >
                    <div className={`h-full rounded-full ${pct >= 70 ? 'bg-forest' : 'bg-gold'}`} style={{ width: `${pct}%` }} />
                  </div>
                </li>
              );
            })}
          </ul>
        </Card>
      )}

      <div className="flex flex-wrap gap-3">
        <Button loading={retaking} onClick={() => void retake()}>
          <RotateCcw className="h-4 w-4" aria-hidden /> Retake with the same settings
        </Button>
        <Link to="/quiz" className={buttonClass('soft')}>
          New quiz
        </Link>
      </div>
      {retryError && <Alert tone="error">{retryError}</Alert>}

      <section aria-labelledby="review-heading" className="space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 id="review-heading" className="text-lg font-bold text-forest">
            Review your answers
          </h2>
          <div className="flex gap-2">
            <ToggleChip pressed={filter === 'all'} onClick={() => setFilter('all')}>
              All ({answers.length})
            </ToggleChip>
            <ToggleChip pressed={filter === 'missed'} onClick={() => setFilter('missed')}>
              Missed ({missed.length})
            </ToggleChip>
          </div>
        </div>

        {shown.length === 0 && <Alert tone="success">You answered every question correctly. Try a harder quiz next.</Alert>}

        <ul className="space-y-3">
          {shown.map((a) => (
            <li key={a.question_id}>
              <details open={!a.is_correct} className="rounded-3xl bg-white shadow-card">
                <summary className="flex cursor-pointer items-start gap-3 p-4 sm:p-5">
                  {a.is_correct ? (
                    <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-forest" aria-label="Correct" />
                  ) : (
                    <XCircle className="mt-0.5 h-5 w-5 shrink-0 text-danger" aria-label="Incorrect" />
                  )}
                  <span className="min-w-0">
                    <span className="block text-xs text-muted">
                      Question {a.position} · {a.topic_title} · {a.subtopic_title}
                    </span>
                    <span className="block font-semibold leading-snug text-forest">{a.stem}</span>
                    {a.selected_option_ids.length === 0 && <span className="mt-1 block text-sm text-danger">You did not answer this question.</span>}
                  </span>
                </summary>
                <div className="space-y-4 px-4 pb-5 sm:px-5">
                  <OptionList
                    groupName={`review-${a.question_id}`}
                    kind={a.kind}
                    options={a.options}
                    selected={a.selected_option_ids}
                    disabled
                    review={a}
                  />
                  <ExplanationPanel review={a} />
                </div>
              </details>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
