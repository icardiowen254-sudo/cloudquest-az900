import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { BookOpen } from 'lucide-react';
import { useAuth } from '../auth/AuthProvider';
import { Alert, Button, Card, Spinner, buttonClass } from '../components/ui';
import { STUDY_GUIDE_URL } from '../lib/constants';
import { daysUntil, formatDate } from '../lib/goals';
import { fetchPerformance, fetchRecentAttempts, fetchTopics } from '../lib/quizApi';
import {
  MIN_ANSWERS_TOPIC,
  WEAK_THRESHOLD,
  difficultyLabel,
  overallTotals,
  percentLabel,
  recommendNext,
  rollUpByTopic,
  weakestSubtopics,
} from '../lib/quizLogic';
import type { RecentAttempt, SubtopicPerformance, TopicSummary } from '../lib/quizTypes';

function StatTile({
  tone,
  label,
  value,
  note,
  action,
}: {
  tone: 'gold' | 'forest';
  label: string;
  value: string;
  note: string;
  action?: { to: string; label: string };
}) {
  const palette = tone === 'gold' ? 'bg-gold text-forest' : 'bg-forest text-white';
  return (
    <div className={`rounded-3xl p-5 ${palette}`}>
      <p className="text-sm font-semibold">{label}</p>
      <p className="mt-2 text-4xl font-bold tracking-tight">{value}</p>
      <p className={`mt-1 text-sm ${tone === 'gold' ? 'font-medium' : 'text-white/80'}`}>
        {note}
        {action && (
          <>
            {' '}
            <Link to={action.to} className="font-bold underline underline-offset-2">
              {action.label}
            </Link>
          </>
        )}
      </p>
    </div>
  );
}

interface DashboardData {
  topics: TopicSummary[];
  performance: SubtopicPerformance[];
  recent: RecentAttempt[];
}

export default function Dashboard() {
  const { profile } = useAuth();
  const [data, setData] = useState<DashboardData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    let active = true;
    setError(null);
    // Every figure below is calculated from the learner's saved quiz answers. RLS limits each query to their own rows.
    Promise.all([fetchTopics(), fetchPerformance(), fetchRecentAttempts(5)])
      .then(([topics, performance, recent]) => {
        if (active) setData({ topics, performance, recent });
      })
      .catch((err: unknown) => {
        if (active) setError(err instanceof Error ? err.message : 'Could not load your dashboard.');
      });
    return () => {
      active = false;
    };
  }, [reloadKey]);

  if (!profile) return null;

  const days = profile.exam_date ? daysUntil(profile.exam_date) : null;
  const examValue = days === null ? 'Not set' : days < 0 ? 'Passed' : days === 0 ? 'Today' : String(days);
  const examNote =
    profile.exam_date === null
      ? 'No exam date yet.'
      : days !== null && days < 0
        ? 'Your date has passed.'
        : formatDate(profile.exam_date);
  const needsDate = days === null || days < 0;
  const headline =
    days === null
      ? 'Add your exam date and CloudQuest will plan around it.'
      : days < 0
        ? 'Your exam date has passed. Set a new one when you book again.'
        : days === 0
          ? 'Your exam is today. Good luck.'
          : `${days} ${days === 1 ? 'day' : 'days'} until your exam.`;
  const dayCount = profile.study_days.length;

  const totals = data ? overallTotals(data.performance) : null;
  const rollups = data ? rollUpByTopic(data.performance) : [];
  const weak = data ? weakestSubtopics(data.performance) : [];
  const next = data ? recommendNext(data.performance) : null;
  const topicName = (id: string | null) => data?.topics.find((t) => t.id === id)?.title ?? 'Mixed topics';
  const asOfRaw = data?.topics[0]?.outline_version.replace('skills-measured-', '') ?? '';
  const asOf = /^\d{4}-\d{2}-\d{2}$/.test(asOfRaw) ? formatDate(asOfRaw) : null;

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl font-bold text-forest sm:text-3xl">Hello, {profile.display_name || 'there'}</h1>
        <p className="mt-1 text-muted">{headline}</p>
      </header>

      <div className="grid gap-4 sm:grid-cols-3">
        <StatTile
          tone="gold"
          label="Days to exam"
          value={examValue}
          note={examNote}
          action={needsDate ? { to: '/settings', label: 'Set a date' } : undefined}
        />
        <StatTile
          tone="forest"
          label="Weekly study time"
          value={`${profile.weekly_study_hours ?? '–'} h`}
          note={`${dayCount} study ${dayCount === 1 ? 'day' : 'days'} a week`}
        />
        <StatTile
          tone="forest"
          label="Questions answered"
          value={totals ? String(totals.attempted) : '–'}
          note={
            !data
              ? 'Loading…'
              : totals && totals.attempted > 0
                ? `${percentLabel(totals.accuracy)} correct overall`
                : 'Take a quiz to get started'
          }
        />
      </div>

      {error && (
        <Alert tone="error">
          <p>{error}</p>
          <div className="mt-3">
            <Button variant="soft" onClick={() => setReloadKey((k) => k + 1)}>
              Try again
            </Button>
          </div>
        </Alert>
      )}
      {!data && !error && <Spinner label="Loading your progress" />}

      {data && (
        <div className="grid gap-6 lg:grid-cols-5">
          <div className="space-y-6 lg:col-span-3">
            <Card>
              <h2 className="text-lg font-bold text-forest">Your practice</h2>
              {totals && totals.attempted === 0 ? (
                <div className="mt-4 flex flex-col items-center rounded-2xl bg-mist px-6 py-10 text-center">
                  <BookOpen className="h-8 w-8 text-forest" aria-hidden />
                  <p className="mt-3 font-semibold text-forest">No practice data yet</p>
                  <p className="mt-1 max-w-sm text-sm text-muted">
                    Complete your first quiz and your accuracy by skill area will appear here, calculated from your saved answers.
                  </p>
                  <Link to="/quiz" className={`${buttonClass('primary')} mt-5`}>
                    Start your first quiz
                  </Link>
                </div>
              ) : (
                <>
                  <p className="mt-1 text-sm text-muted">
                    Accuracy by skill area, from your saved answers. Skipped questions count as incorrect.
                  </p>
                  <ul className="mt-5 space-y-5">
                    {data.topics.map((t) => {
                      const r = rollups.find((x) => x.topicId === t.id);
                      const attempted = r?.attempted ?? 0;
                      const enough = attempted >= MIN_ANSWERS_TOPIC;
                      const pct = r && r.accuracy !== null ? Math.round(r.accuracy * 100) : 0;
                      return (
                        <li key={t.id}>
                          <div className="flex items-baseline justify-between gap-3 text-sm">
                            <span className="font-semibold text-forest">{t.title}</span>
                            <span className="shrink-0 text-muted">
                              {attempted === 0
                                ? 'No answers yet'
                                : `${percentLabel(r?.accuracy ?? null)} · ${attempted} ${attempted === 1 ? 'answer' : 'answers'}`}
                            </span>
                          </div>
                          <div
                            role="img"
                            aria-label={`${t.title}: ${attempted === 0 ? 'no answers yet' : `${pct} percent correct from ${attempted} answers`}`}
                            className="mt-2 h-3 overflow-hidden rounded-full bg-mist"
                          >
                            <div
                              className={`h-full rounded-full ${r && r.accuracy !== null && r.accuracy < WEAK_THRESHOLD ? 'bg-gold' : 'bg-forest'}`}
                              style={{ width: `${pct}%` }}
                            />
                          </div>
                          {attempted > 0 && !enough && (
                            <p className="mt-1 text-xs text-muted">Not enough practice data yet to judge this area.</p>
                          )}
                        </li>
                      );
                    })}
                  </ul>

                  <h3 className="mt-7 text-base font-bold text-forest">Needs more practice</h3>
                  {weak.length === 0 ? (
                    <p className="mt-1 text-sm text-muted">
                      No weak spots yet. Areas show here once you have answered at least three questions in them and scored under{' '}
                      {Math.round(WEAK_THRESHOLD * 100)}%.
                    </p>
                  ) : (
                    <ul className="mt-2 divide-y divide-forest/10">
                      {weak.map((w) => (
                        <li key={w.subtopic_id} className="flex items-center justify-between gap-3 py-2.5 text-sm">
                          <span className="min-w-0">
                            <span className="block truncate font-semibold text-forest">{w.subtopic_title}</span>
                            <span className="block text-muted">{w.topic_title}</span>
                          </span>
                          <span className="shrink-0 font-bold text-forest">
                            {w.correct}/{w.attempted}
                          </span>
                        </li>
                      ))}
                    </ul>
                  )}
                </>
              )}
            </Card>
          </div>

          <div className="space-y-6 lg:col-span-2">
            {next && (
              <Card>
                <h2 className="text-lg font-bold text-forest">Recommended next</h2>
                {next.kind === 'first-quiz' && (
                  <p className="mt-2 text-sm text-muted">A short mixed quiz is the quickest way to see where you stand.</p>
                )}
                {next.kind === 'practise' && (
                  <p className="mt-2 text-sm text-muted">
                    You scored {Math.round(next.accuracy * 100)}% in <strong className="text-forest">{next.subtopicTitle}</strong>. Another
                    round there is your best next step.
                  </p>
                )}
                {next.kind === 'mixed' && (
                  <p className="mt-2 text-sm text-muted">No weak spots right now. Keep your knowledge fresh with a mixed quiz.</p>
                )}
                <Link
                  to={next.kind === 'practise' ? `/quiz?topic=${next.topicSlug}` : '/quiz'}
                  className={`${buttonClass('primary', true)} mt-4`}
                >
                  {next.kind === 'practise' ? 'Practise this area' : next.kind === 'first-quiz' ? 'Start a quiz' : 'Take a mixed quiz'}
                </Link>
              </Card>
            )}

            <Card>
              <h2 className="text-lg font-bold text-forest">Recent quizzes</h2>
              {data.recent.length === 0 ? (
                <p className="mt-2 text-sm text-muted">Completed quizzes are saved here so you can review them any time.</p>
              ) : (
                <ul className="mt-3 divide-y divide-forest/10">
                  {data.recent.map((a) => (
                    <li key={a.id}>
                      <Link to={`/quiz/${a.id}/results`} className="flex items-center justify-between gap-3 py-3 text-sm hover:text-forest">
                        <span className="min-w-0">
                          <span className="block truncate font-semibold text-forest">{topicName(a.topic_id)}</span>
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

            <Card>
              <h2 className="text-lg font-bold text-forest">What AZ-900 covers</h2>
              <p className="mt-1 text-sm text-muted">Share of the exam by skill area, as Microsoft publishes it.</p>
              <ul className="mt-4 space-y-4">
                {data.topics.map((t) => (
                  <li key={t.id}>
                    <div className="flex items-baseline justify-between gap-3">
                      <span className="text-sm font-semibold text-forest">{t.title}</span>
                      <span className="shrink-0 text-sm text-muted">
                        {t.weight_min}–{t.weight_max}%
                      </span>
                    </div>
                    <div
                      role="img"
                      aria-label={`${t.title}: ${t.weight_min} to ${t.weight_max} percent of the exam`}
                      className="mt-2 flex h-3 overflow-hidden rounded-full bg-mist"
                    >
                      <div className="bg-forest" style={{ width: `${(t.weight_min / 40) * 100}%` }} />
                      <div className="bg-gold" style={{ width: `${((t.weight_max - t.weight_min) / 40) * 100}%` }} />
                    </div>
                  </li>
                ))}
              </ul>
              <p className="mt-4 text-xs leading-relaxed text-muted">
                {asOf ? `Skills measured as of ${asOf}. ` : ''}
                Weights are ranges and can change, so check the{' '}
                <a
                  href={STUDY_GUIDE_URL}
                  target="_blank"
                  rel="noreferrer"
                  className="font-semibold text-forest underline underline-offset-2"
                >
                  Microsoft Learn study guide
                </a>{' '}
                before you sit the exam.
              </p>
            </Card>
          </div>
        </div>
      )}
    </div>
  );
}
