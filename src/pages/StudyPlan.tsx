import { useEffect, useMemo, useState } from 'react';
import { useAuth } from '../auth/AuthProvider';
import { Alert, Button, Card, Spinner, TextField, ToggleChip } from '../components/ui';
import { daysUntil, formatDate, todayISO, WEEKDAYS } from '../lib/goals';
import { fetchPerformance } from '../lib/quizApi';
import { fetchActivePlan, fetchPlanSubtopics, fetchSessions, moveSession, savePlan, updateSessionStatus, type PlanRow, type SessionRow } from '../lib/stage3Api';
import { generatePlan, type PlanResult, type PlanSubtopic } from '../lib/studyPlan';
import type { SubtopicPerformance } from '../lib/quizTypes';
import type { Profile } from '../types';

const message = (err: unknown) => (err instanceof Error ? err.message : 'Something went wrong. Please try again.');

const KIND_LABEL: Record<string, string> = { learn: 'Learn', quiz: 'Quiz', flashcards: 'Flashcards', review: 'Review', mock: 'Mock exam' };

export default function StudyPlan() {
  const { profile } = useAuth();
  const [plan, setPlan] = useState<PlanRow | null | undefined>(undefined);
  const [sessions, setSessions] = useState<SessionRow[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    let active = true;
    setError(null);
    (async () => {
      try {
        const active_plan = await fetchActivePlan();
        const rows = active_plan ? await fetchSessions(active_plan.id) : [];
        if (!active) return;
        setPlan(active_plan);
        setSessions(rows);
      } catch (err) {
        if (active) setError(message(err));
      }
    })();
    return () => {
      active = false;
    };
  }, [reloadKey]);

  if (!profile) return null;
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
  if (plan === undefined) return <Spinner label="Loading your plan" />;
  if (!plan || editing) {
    return (
      <PlanSetup
        profile={profile}
        onSaved={() => {
          setEditing(false);
          setReloadKey((k) => k + 1);
        }}
        onCancel={plan ? () => setEditing(false) : undefined}
      />
    );
  }
  return <PlanView plan={plan} sessions={sessions} onChanged={() => setReloadKey((k) => k + 1)} onRegenerate={() => setEditing(true)} />;
}

function PlanSetup({ profile, onSaved, onCancel }: { profile: Profile; onSaved: () => void; onCancel?: () => void }) {
  const [examDate, setExamDate] = useState(profile.exam_date ?? '');
  const [hours, setHours] = useState<number>(profile.weekly_study_hours ?? 5);
  const [days, setDays] = useState<number[]>(profile.study_days?.length ? profile.study_days : [1, 3, 5]);
  const [preview, setPreview] = useState<{ result: PlanResult; examDate: string; hours: number; days: number[] } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<'build' | 'save' | null>(null);

  function toggleDay(d: number) {
    setPreview(null);
    setDays((cur) => (cur.includes(d) ? cur.filter((x) => x !== d) : [...cur, d].sort((a, b) => a - b)));
  }

  async function build() {
    setError(null);
    if (!examDate || !/^\d{4}-\d{2}-\d{2}$/.test(examDate)) return setError('Choose your exam date.');
    if (!(hours >= 1 && hours <= 80)) return setError('Enter between 1 and 80 study hours a week.');
    if (days.length === 0) return setError('Choose at least one study day.');
    setBusy('build');
    try {
      const [subtopics, performance] = await Promise.all([fetchPlanSubtopics(), fetchPerformance()]);
      const byId = new Map<string, SubtopicPerformance>(performance.map((p) => [p.subtopic_id, p]));
      const inputs: PlanSubtopic[] = subtopics.map((s) => {
        const p = byId.get(s.id);
        return {
          id: s.id,
          topicId: s.topic_id,
          title: s.title,
          topicTitle: s.topics.title,
          topicWeightMid: (s.topics.weight_min + s.topics.weight_max) / 2,
          attempted: p?.attempted ?? 0,
          correct: p?.correct ?? 0,
        };
      });
      const result = generatePlan({ today: todayISO(), examDate, weeklyHours: hours, studyDays: days, subtopics: inputs });
      setPreview({ result, examDate, hours, days });
    } catch (err) {
      setError(message(err));
    } finally {
      setBusy(null);
    }
  }

  async function save() {
    if (!preview) return;
    setBusy('save');
    setError(null);
    try {
      await savePlan(preview.examDate, preview.hours, preview.days, preview.result.sessions);
      onSaved();
    } catch (err) {
      setError(message(err));
      setBusy(null);
    }
  }

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <header>
        <h1 className="text-2xl font-bold text-forest sm:text-3xl">{onCancel ? 'Change your plan' : 'Build your study plan'}</h1>
        <p className="mt-1 text-muted">
          We plan sessions from your exam date, your time and your practice results. It is a recommendation, not a guarantee of passing.
        </p>
      </header>

      <Card className="space-y-5">
        <TextField
          visibleLabel
          label="Exam date"
          type="date"
          min={todayISO()}
          value={examDate}
          onChange={(e) => {
            setPreview(null);
            setExamDate(e.target.value);
          }}
          hint="The day you sit the exam. Sessions finish the day before."
        />
        <div>
          <p className="mb-2 px-1 text-sm font-semibold text-forest">Hours per week</p>
          <div className="mb-3 flex flex-wrap gap-2">
            {[3, 5, 8, 12].map((h) => (
              <ToggleChip
                key={h}
                pressed={hours === h}
                onClick={() => {
                  setPreview(null);
                  setHours(h);
                }}
              >
                {h} h
              </ToggleChip>
            ))}
          </div>
          <TextField
            label="Hours per week"
            type="number"
            min={1}
            max={80}
            step={0.5}
            value={Number.isFinite(hours) ? hours : ''}
            onChange={(e) => {
              setPreview(null);
              setHours(e.target.value === '' ? NaN : Number(e.target.value));
            }}
          />
        </div>
        <fieldset>
          <legend className="mb-2 px-1 text-sm font-semibold text-forest">Study days</legend>
          <div className="flex flex-wrap gap-2">
            {WEEKDAYS.map((label, d) => (
              <ToggleChip key={label} pressed={days.includes(d)} onClick={() => toggleDay(d)}>
                {label}
              </ToggleChip>
            ))}
          </div>
        </fieldset>
      </Card>

      {error && <Alert tone="error">{error}</Alert>}

      {!preview ? (
        <div className="flex flex-wrap gap-3">
          <Button loading={busy === 'build'} onClick={() => void build()}>
            Preview my plan
          </Button>
          {onCancel && (
            <Button variant="soft" onClick={onCancel}>
              Keep current plan
            </Button>
          )}
        </div>
      ) : (
        <Card className="space-y-5">
          <h2 className="text-lg font-bold text-forest">Your plan preview</h2>
          <p className="text-sm text-muted">
            {preview.result.sessions.length} sessions on {preview.result.studyDays} study {preview.result.studyDays === 1 ? 'day' : 'days'},
            about {Math.round(preview.result.totalMinutes / 60)} hours in total, around {preview.result.minutesPerStudyDay} minutes a study day.
          </p>
          {preview.result.warnings.map((w) => (
            <Alert key={w} tone="info">
              {w}
            </Alert>
          ))}
          {preview.result.sessions.length > 0 && (
            <ol className="divide-y divide-forest/10 text-sm">
              {preview.result.sessions.slice(0, 6).map((s, i) => (
                <li key={i} className="flex items-center justify-between gap-3 py-2.5">
                  <span className="min-w-0 truncate text-forest">{s.title}</span>
                  <span className="shrink-0 text-muted">
                    {formatDate(s.scheduled_for)} · {s.planned_minutes} min
                  </span>
                </li>
              ))}
            </ol>
          )}
          {preview.result.sessions.length > 6 && (
            <p className="text-sm text-muted">…and {preview.result.sessions.length - 6} more after you save.</p>
          )}
          <p className="text-xs text-muted">{'Sessions are estimates. Skip or move any that do not fit your week.'}</p>
          <div className="flex flex-wrap gap-3">
            <Button loading={busy === 'save'} disabled={preview.result.sessions.length === 0} onClick={() => void save()}>
              {onCancel ? 'Replace my plan' : 'Save my plan'}
            </Button>
            <Button variant="soft" onClick={() => setPreview(null)}>
              Change settings
            </Button>
          </div>
        </Card>
      )}
    </div>
  );
}

function PlanView({
  plan,
  sessions,
  onChanged,
  onRegenerate,
}: {
  plan: PlanRow;
  sessions: SessionRow[];
  onChanged: () => void;
  onRegenerate: () => void;
}) {
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const today = todayISO();
  const done = sessions.filter((s) => s.status === 'completed').length;
  const percent = sessions.length > 0 ? Math.round((done / sessions.length) * 100) : 0;
  const days = daysUntil(plan.exam_date);

  const overdue = useMemo(() => sessions.filter((s) => s.status === 'pending' && s.scheduled_for < today), [sessions, today]);
  const upcoming = useMemo(() => sessions.filter((s) => s.scheduled_for >= today), [sessions, today]);
  const byDay = useMemo(() => {
    const map = new Map<string, SessionRow[]>();
    for (const s of upcoming) map.set(s.scheduled_for, [...(map.get(s.scheduled_for) ?? []), s]);
    return [...map.entries()];
  }, [upcoming]);

  async function run(id: string, fn: () => Promise<void>) {
    setBusyId(id);
    setError(null);
    try {
      await fn();
      onChanged();
    } catch (err) {
      setError(message(err));
    } finally {
      setBusyId(null);
    }
  }

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-forest sm:text-3xl">Your study plan</h1>
          <p className="mt-1 text-muted">
            Exam on {formatDate(plan.exam_date)}
            {days >= 0 ? ` · ${days} ${days === 1 ? 'day' : 'days'} to go` : ''}
          </p>
        </div>
        <Button variant="soft" onClick={onRegenerate}>
          Regenerate plan
        </Button>
      </header>

      <Card>
        <div className="flex items-baseline justify-between gap-3">
          <p className="font-semibold text-forest">Plan completion</p>
          <p className="text-sm text-muted">
            {done} of {sessions.length} sessions done
          </p>
        </div>
        <div role="progressbar" aria-label="Plan completion" aria-valuemin={0} aria-valuemax={100} aria-valuenow={percent} className="mt-3 h-3 overflow-hidden rounded-full bg-mist">
          <div className="h-full rounded-full bg-forest transition-all" style={{ width: `${percent}%` }} />
        </div>
        <p className="mt-3 text-xs text-muted">Sessions are estimates. Skip or move any that do not fit your week.</p>
      </Card>

      {error && <Alert tone="error">{error}</Alert>}

      {sessions.length === 0 && (
        <Card className="text-center">
          <p className="text-muted">This plan has no sessions, because the exam is too soon for your study days. Regenerate it with more days or a later date.</p>
        </Card>
      )}

      {overdue.length > 0 && (
        <Card>
          <h2 className="text-lg font-bold text-gold">Overdue</h2>
          <p className="text-sm text-muted">These were scheduled earlier. Do them, move them forward or skip them.</p>
          <ul className="mt-2 divide-y divide-forest/10">
            {overdue.map((s) => (
              <SessionRow key={s.id} s={s} today={today} examDate={plan.exam_date} busyId={busyId} run={run} />
            ))}
          </ul>
        </Card>
      )}

      {byDay.map(([date, rows]) => (
        <Card key={date}>
          <h2 className={`text-base font-bold ${date === today ? 'text-forest' : 'text-muted'}`}>{date === today ? 'Today' : formatDate(date)}</h2>
          <ul className="mt-2 divide-y divide-forest/10">
            {rows.map((s) => (
              <SessionRow key={s.id} s={s} today={today} examDate={plan.exam_date} busyId={busyId} run={run} />
            ))}
          </ul>
        </Card>
      ))}

      <p className="text-center text-xs leading-relaxed text-muted">
        This plan is a recommendation based on the time you have and your practice results. It does not guarantee a pass.
      </p>
    </div>
  );
}

function SessionRow({
  s,
  today,
  examDate,
  busyId,
  run,
}: {
  s: SessionRow;
  today: string;
  examDate: string;
  busyId: string | null;
  run: (id: string, fn: () => Promise<void>) => Promise<void>;
}) {
  const [moveTo, setMoveTo] = useState('');
  const finished = s.status !== 'pending';
  return (
    <li className="py-3">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className={`font-semibold ${finished ? 'text-muted line-through' : 'text-forest'}`}>{s.title}</p>
          <p className="text-xs text-muted">
            {KIND_LABEL[s.kind] ?? s.kind} · {s.planned_minutes} min
            {s.rescheduled_from ? ` · moved from ${formatDate(s.rescheduled_from)}` : ''}
            {s.status === 'skipped' ? ' · skipped' : ''}
          </p>
        </div>
        <div className="flex shrink-0 flex-wrap justify-end gap-2">
          {s.status !== 'skipped' && (
            <Button
              variant={s.status === 'completed' ? 'soft' : 'lime'}
              loading={busyId === s.id}
              onClick={() => void run(s.id, () => updateSessionStatus(s.id, s.status === 'completed' ? 'pending' : 'completed'))}
            >
              {s.status === 'completed' ? 'Undo' : 'Done'}
            </Button>
          )}
          {s.status === 'pending' && (
            <Button variant="ghost" onClick={() => void run(s.id, () => updateSessionStatus(s.id, 'skipped'))}>
              Skip
            </Button>
          )}
          {s.status === 'skipped' && (
            <Button variant="ghost" onClick={() => void run(s.id, () => updateSessionStatus(s.id, 'pending'))}>
              Restore
            </Button>
          )}
        </div>
      </div>
      {s.status === 'pending' && (
        <div className="mt-2 flex flex-wrap items-center gap-2">
          <label htmlFor={`move-${s.id}`} className="text-xs font-semibold text-forest">
            Move to
          </label>
          <input
            id={`move-${s.id}`}
            type="date"
            value={moveTo}
            min={today}
            max={examDate}
            onChange={(e) => setMoveTo(e.target.value)}
            className="h-9 rounded-full border border-forest/15 bg-white px-3 text-sm"
          />
          <Button
            variant="soft"
            disabled={!moveTo || moveTo === s.scheduled_for}
            loading={busyId === s.id}
            onClick={() => void run(s.id, () => moveSession(s.id, s.rescheduled_from ?? s.scheduled_for, moveTo))}
          >
            Move
          </Button>
        </div>
      )}
    </li>
  );
}
