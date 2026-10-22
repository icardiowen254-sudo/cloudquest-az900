import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft, ArrowRight } from 'lucide-react';
import { ExplanationPanel, OptionList } from '../components/OptionList';
import { Alert, Button, Card, Spinner } from '../components/ui';
import { checkAnswer, loadAttempt, loadProgress, submitQuiz } from '../lib/quizApi';
import { clearDraft, loadDraft, saveDraft } from '../lib/quizDraft';
import { buildSubmitPayload, countUnanswered, difficultyLabel, toggleSelection } from '../lib/quizLogic';
import type { AttemptMeta, QuestionReview, RunQuestion } from '../lib/quizTypes';

export default function QuizRun() {
  const { attemptId } = useParams();
  const navigate = useNavigate();

  const [attempt, setAttempt] = useState<AttemptMeta | null>(null);
  const [questions, setQuestions] = useState<RunQuestion[]>([]);
  const [reviews, setReviews] = useState<Record<string, QuestionReview>>({});
  const [index, setIndex] = useState(0);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [busy, setBusy] = useState<'check' | 'submit' | null>(null);
  const [confirming, setConfirming] = useState(false);

  useEffect(() => {
    if (!attemptId) {
      setLoadError('That quiz address is not valid.');
      setLoading(false);
      return;
    }
    let active = true;
    (async () => {
      try {
        const loaded = await loadAttempt(attemptId);
        if (!active) return;
        if (loaded.attempt.status === 'completed') {
          navigate(`/quiz/${attemptId}/results`, { replace: true });
          return;
        }

        let qs = loaded.questions;
        const revs: Record<string, QuestionReview> = {};
        let start = 0;
        if (loaded.attempt.feedback === 'instant') {
          // The server holds locked answers and their feedback, so a refresh resumes cleanly.
          for (const r of await loadProgress(attemptId)) revs[r.question_id] = r;
          qs = qs.map((q) => (revs[q.questionId] ? { ...q, selected: revs[q.questionId].selected_option_ids, locked: true } : q));
          const firstOpen = qs.findIndex((q) => !q.locked);
          start = firstOpen === -1 ? qs.length - 1 : firstOpen;
        } else {
          const draft = loadDraft(attemptId);
          if (draft) {
            qs = qs.map((q) => ({
              ...q,
              selected: (draft.selected[q.questionId] ?? []).filter((id) => q.options.some((o) => o.id === id)),
            }));
            start = Math.min(Math.max(draft.index, 0), qs.length - 1);
          }
        }
        if (!active) return;
        setAttempt(loaded.attempt);
        setQuestions(qs);
        setReviews(revs);
        setIndex(start);
        setLoading(false);
      } catch (err) {
        if (!active) return;
        setLoadError(err instanceof Error ? err.message : 'Could not load this quiz.');
        setLoading(false);
      }
    })();
    return () => {
      active = false;
    };
  }, [attemptId, navigate]);

  // Exam-style quizzes keep selections in this browser tab until they are submitted.
  useEffect(() => {
    if (!attemptId || !attempt || attempt.feedback !== 'end' || loading) return;
    const selected: Record<string, string[]> = {};
    for (const q of questions) if (q.selected.length > 0) selected[q.questionId] = q.selected;
    saveDraft(attemptId, { selected, index });
  }, [attemptId, attempt, questions, index, loading]);

  if (loading) {
    return (
      <div className="mx-auto max-w-3xl">
        <Spinner label="Loading your quiz" />
      </div>
    );
  }

  if (loadError || !attempt || questions.length === 0) {
    return (
      <div className="mx-auto max-w-3xl space-y-4">
        <Alert tone="error">{loadError ?? 'This quiz could not be loaded.'}</Alert>
        <Link to="/quiz" className="inline-block text-sm font-semibold text-forest underline underline-offset-2">
          Back to quizzes
        </Link>
      </div>
    );
  }

  const instant = attempt.feedback === 'instant';
  const q = questions[index];
  const review = reviews[q.questionId];
  const total = questions.length;
  const isLast = index === total - 1;
  const answered = questions.filter((x) => x.locked || x.selected.length > 0).length;
  const unanswered = countUnanswered(questions);

  function toggle(optionId: string) {
    if (q.locked) return;
    setActionError(null);
    setQuestions((qs) =>
      qs.map((x) => (x.questionId === q.questionId ? { ...x, selected: toggleSelection(x.kind, x.selected, optionId) } : x)),
    );
  }

  async function check() {
    if (!attemptId || q.selected.length === 0) return;
    setBusy('check');
    setActionError(null);
    try {
      const result = await checkAnswer(attemptId, q.questionId, q.selected);
      setReviews((r) => ({ ...r, [q.questionId]: result }));
      setQuestions((qs) =>
        qs.map((x) => (x.questionId === q.questionId ? { ...x, locked: true, selected: result.selected_option_ids } : x)),
      );
    } catch (err) {
      setActionError(err instanceof Error ? err.message : 'Could not check that answer.');
    } finally {
      setBusy(null);
    }
  }

  async function submit() {
    if (!attemptId) return;
    setBusy('submit');
    setActionError(null);
    try {
      await submitQuiz(attemptId, buildSubmitPayload(questions));
      clearDraft(attemptId);
      navigate(`/quiz/${attemptId}/results`, { replace: true });
    } catch (err) {
      setActionError(err instanceof Error ? err.message : 'Could not submit the quiz.');
      setBusy(null);
    }
  }

  function requestFinish() {
    if (unanswered > 0 && !confirming) {
      setConfirming(true);
      return;
    }
    void submit();
  }

  function go(next: number) {
    setConfirming(false);
    setActionError(null);
    setIndex(next);
  }

  return (
    <div className="mx-auto max-w-3xl space-y-5">
      <header>
        <div className="flex flex-wrap items-center justify-between gap-2 text-sm">
          <p className="font-semibold text-forest">
            Question {index + 1} of {total}
          </p>
          <p className="text-muted">
            {q.topicTitle} · {difficultyLabel(q.difficulty)}
          </p>
        </div>
        <div
          role="progressbar"
          aria-label="Questions answered"
          aria-valuemin={0}
          aria-valuemax={total}
          aria-valuenow={answered}
          className="mt-2 h-2 overflow-hidden rounded-full bg-white"
        >
          <div className="h-full rounded-full bg-forest transition-all" style={{ width: `${(answered / total) * 100}%` }} />
        </div>
      </header>

      <Card>
        <fieldset>
          <legend className="text-lg font-bold leading-snug text-forest sm:text-xl">{q.stem}</legend>
          <p className="mt-2 text-sm text-muted">{q.kind === 'single' ? 'Select one answer.' : 'Select all that apply.'}</p>
          <div className="mt-4">
            <OptionList
              groupName={`question-${q.questionId}`}
              kind={q.kind}
              options={q.options}
              selected={q.selected}
              disabled={q.locked}
              onToggle={toggle}
              review={review}
            />
          </div>
        </fieldset>

        {review && (
          <div className="mt-4">
            <ExplanationPanel review={review} />
          </div>
        )}
      </Card>

      {confirming && unanswered > 0 && (
        <Alert tone="info">
          <p>
            You have {unanswered} unanswered {unanswered === 1 ? 'question' : 'questions'}. Unanswered questions are marked incorrect.
          </p>
          <div className="mt-3 flex flex-wrap gap-2">
            <Button variant="soft" onClick={() => setConfirming(false)}>
              Keep working
            </Button>
            <Button loading={busy === 'submit'} onClick={() => void submit()}>
              Submit anyway
            </Button>
          </div>
        </Alert>
      )}
      {actionError && <Alert tone="error">{actionError}</Alert>}

      <div className="flex flex-wrap items-center justify-between gap-3">
        <Button variant="soft" disabled={index === 0} onClick={() => go(index - 1)}>
          <ArrowLeft className="h-4 w-4" aria-hidden /> Previous
        </Button>
        <div className="flex flex-wrap gap-3">
          {instant && !q.locked && (
            <Button loading={busy === 'check'} disabled={q.selected.length === 0} onClick={() => void check()}>
              Check answer
            </Button>
          )}
          {!isLast && (
            <Button variant={instant && !q.locked ? 'soft' : 'primary'} onClick={() => go(index + 1)}>
              Next <ArrowRight className="h-4 w-4" aria-hidden />
            </Button>
          )}
          {isLast && (!instant || q.locked || answered === total) && (
            <Button loading={busy === 'submit'} onClick={requestFinish}>
              Finish quiz
            </Button>
          )}
        </div>
      </div>

      <nav aria-label="Question navigator" className="flex flex-wrap gap-2 pt-1">
        {questions.map((item, i) => {
          const r = reviews[item.questionId];
          const state = r ? (r.is_correct ? 'correct' : 'incorrect') : item.selected.length > 0 ? 'answered' : 'unanswered';
          const style =
            i === index
              ? 'border-forest bg-forest text-white'
              : state === 'correct'
                ? 'border-lime bg-lime text-forest'
                : state === 'incorrect'
                  ? 'border-gold bg-gold-soft text-forest'
                  : state === 'answered'
                    ? 'border-forest/40 bg-white text-forest'
                    : 'border-forest/15 bg-mist text-muted';
          return (
            <button
              key={item.questionId}
              type="button"
              onClick={() => go(i)}
              aria-label={`Question ${i + 1}, ${state}`}
              aria-current={i === index ? 'step' : undefined}
              className={`grid h-9 w-9 place-items-center rounded-full border text-sm font-bold ${style}`}
            >
              {i + 1}
            </button>
          );
        })}
      </nav>
    </div>
  );
}
