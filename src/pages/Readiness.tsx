import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Alert, Button, Card, Spinner, buttonClass } from '../components/ui';
import { STUDY_GUIDE_URL } from '../lib/constants';
import { percentLabel } from '../lib/quizLogic';
import { fetchPerformance, fetchRecentAttempts, fetchTopics } from '../lib/quizApi';
import { STATUS_LABEL, calculateReadiness, type ReadinessResult } from '../lib/readiness';
import { fetchSubtopicCount } from '../lib/stage3Api';

const TREND_TEXT = {
  up: 'Your latest quiz scored higher than your earlier average.',
  down: 'Your latest quiz scored lower than your earlier average.',
  flat: 'Your latest quiz is close to your earlier average.',
};

export default function Readiness() {
  const [result, setResult] = useState<ReadinessResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    let active = true;
    setError(null);
    Promise.all([fetchTopics(), fetchPerformance(), fetchRecentAttempts(10), fetchSubtopicCount()])
      .then(([topics, performance, attempts, totalSubtopics]) => {
        if (!active) return;
        setResult(calculateReadiness({ topics, performance, totalSubtopics, attempts, now: new Date() }));
      })
      .catch((err: unknown) => {
        if (active) setError(err instanceof Error ? err.message : 'Could not calculate your readiness.');
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
  if (!result) return <Spinner label="Calculating your readiness" />;

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <header>
        <h1 className="text-2xl font-bold text-forest sm:text-3xl">Readiness</h1>
        <p className="mt-1 text-muted">A practice-based picture of where you stand. It is not a prediction of your exam result.</p>
      </header>

      <div className={`rounded-3xl p-6 ${result.status === 'strong' ? 'bg-forest text-white' : 'bg-white shadow-card'}`}>
        <p className={`text-sm font-semibold ${result.status === 'strong' ? 'text-white/80' : 'text-muted'}`}>Practice readiness</p>
        <p className={`mt-1 text-2xl font-bold ${result.status === 'strong' ? 'text-white' : 'text-forest'}`}>{STATUS_LABEL[result.status]}</p>
        {result.score !== null ? (
          <>
            <p className={`mt-3 text-5xl font-bold tracking-tight ${result.status === 'strong' ? 'text-white' : 'text-forest'}`}>{percentLabel(result.score)}</p>
            <p className={`mt-2 text-sm ${result.status === 'strong' ? 'text-white/80' : 'text-muted'}`}>
              Weighted practice accuracy across the skill areas. Strong results on practice do not guarantee a pass.
            </p>
          </>
        ) : (
          <div className="mt-3 space-y-2">
            <p className="text-sm text-muted">No estimate is shown until there is enough practice to judge:</p>
            <ul className="list-disc space-y-1 pl-5 text-sm text-ink">
              {result.reasons.map((r) => (
                <li key={r}>{r}</li>
              ))}
            </ul>
            <Link to="/quiz" className={`${buttonClass('primary')} mt-3`}>
              Start a quiz
            </Link>
          </div>
        )}
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        <Card>
          <p className="text-sm font-semibold text-muted">Answers so far</p>
          <p className="mt-1 text-3xl font-bold text-forest">{result.answers}</p>
        </Card>
        <Card>
          <p className="text-sm font-semibold text-muted">Areas with enough practice</p>
          <p className="mt-1 text-3xl font-bold text-forest">{percentLabel(result.coverage)}</p>
        </Card>
        <Card>
          <p className="text-sm font-semibold text-muted">Latest practice</p>
          <p className="mt-1 text-3xl font-bold text-forest">
            {result.daysSincePractice === null ? '–' : result.daysSincePractice === 0 ? 'Today' : `${result.daysSincePractice}d ago`}
          </p>
        </Card>
      </div>

      <Card>
        <h2 className="text-lg font-bold text-forest">By skill area</h2>
        <ul className="mt-4 space-y-4">
          {result.topics.map((t) => (
            <li key={t.topicId}>
              <div className="flex items-baseline justify-between gap-3 text-sm">
                <span className="font-semibold text-forest">
                  {t.title} <span className="font-normal text-muted">· exam weight {Math.round(t.weight)}%</span>
                </span>
                <span className="shrink-0 text-muted">{t.meetsSample ? percentLabel(t.accuracy) : t.attempted === 0 ? 'No answers yet' : 'Not enough practice yet'}</span>
              </div>
              <div
                role="img"
                aria-label={`${t.title}: ${t.meetsSample ? percentLabel(t.accuracy) : 'not enough practice yet'}`}
                className="mt-2 h-3 overflow-hidden rounded-full bg-mist"
              >
                <div
                  className={`h-full rounded-full ${t.meetsSample && t.accuracy !== null && t.accuracy < 0.7 ? 'bg-gold' : 'bg-forest'}`}
                  style={{ width: t.meetsSample && t.accuracy !== null ? `${Math.round(t.accuracy * 100)}%` : '0%' }}
                />
              </div>
            </li>
          ))}
        </ul>
      </Card>

      <div className="grid gap-4 sm:grid-cols-2">
        <Card>
          <h2 className="text-base font-bold text-forest">Strong areas</h2>
          {result.strongAreas.length === 0 ? (
            <p className="mt-2 text-sm text-muted">Nothing at 75% or above yet.</p>
          ) : (
            <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-ink">
              {result.strongAreas.map((a) => (
                <li key={a}>{a}</li>
              ))}
            </ul>
          )}
        </Card>
        <Card>
          <h2 className="text-base font-bold text-forest">Needs more practice</h2>
          {result.needsPractice.length === 0 ? (
            <p className="mt-2 text-sm text-muted">No area is below 70% with enough practice.</p>
          ) : (
            <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-ink">
              {result.needsPractice.map((a) => (
                <li key={a}>{a}</li>
              ))}
            </ul>
          )}
        </Card>
      </div>

      <Card>
        <h2 className="text-lg font-bold text-forest">Recent trend</h2>
        <p className="mt-2 text-sm text-ink">
          {result.trend ? TREND_TEXT[result.trend] : 'Complete at least three quizzes to see a trend.'}
        </p>
      </Card>

      <Card>
        <h2 className="text-lg font-bold text-forest">Suggested next steps</h2>
        <ul className="mt-3 space-y-2 text-sm text-ink">
          {result.actions.map((a) => (
            <li key={a} className="flex gap-2">
              <span aria-hidden className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-lime" />
              <span>{a}</span>
            </li>
          ))}
        </ul>
        <div className="mt-5 flex flex-wrap gap-3">
          <Link to="/quiz" className={buttonClass('primary')}>
            Take a quiz
          </Link>
          <Link to="/flashcards" className={buttonClass('soft')}>
            Review flashcards
          </Link>
        </div>
      </Card>

      <details className="rounded-3xl bg-white p-5 text-sm text-ink shadow-card">
        <summary className="cursor-pointer font-bold text-forest">How this is calculated</summary>
        <ol className="mt-4 list-decimal space-y-2 pl-5 text-muted">
          <li>Each skill area's accuracy is correct answers divided by answers, counting only areas with at least 5 answers.</li>
          <li>The practice score averages those accuracies, weighted by each area's midpoint exam weight (for example 32.5 for 30 to 35%).</li>
          <li>An estimate is shown only with at least 20 answers, and at least 3 answers in 60% of skill areas.</li>
          <li>Bands: under 60% is Building, 60 to 74% is Developing, 75% and above is Strong practice results.</li>
          <li>Trend compares your newest quiz with the average of earlier quizzes, once you have three.</li>
        </ol>
        <p className="mt-4 text-xs text-muted">
          Exam weights come from the{' '}
          <a href={STUDY_GUIDE_URL} target="_blank" rel="noreferrer" className="font-semibold text-forest underline underline-offset-2">
            Microsoft Learn study guide
          </a>
          . Practice questions are original and are not real exam questions.
        </p>
      </details>
    </div>
  );
}
