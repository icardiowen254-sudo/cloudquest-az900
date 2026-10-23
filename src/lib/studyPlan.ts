// Study plan generator. Pure functions: the same inputs always give the same plan.
//
// How the plan is built:
//  1. Study days are the chosen weekdays between today and the day before the exam.
//  2. Weekly hours are shared across study days. Each day gets sessions of about 45 minutes
//     (15 to 120 minutes), so a day with 90 minutes gets two 45-minute sessions.
//  3. Each session goes to a skill area. Weak and unseen areas get more sessions, weighted by
//     how far below 100% the learner is and by how much of the exam the area covers.
//  4. Areas under 70% get "review" sessions. Other areas alternate between a practice quiz and flashcards.
//  5. The last study day ends with a mock mixed quiz.
//
// A plan is a recommendation, not a guarantee of exam success.

export const SESSION_KINDS = ['learn', 'quiz', 'flashcards', 'review', 'mock'] as const;
export type SessionKind = (typeof SESSION_KINDS)[number];

export const MIN_SESSION_MINUTES = 15;
export const MAX_SESSION_MINUTES = 120;
const TARGET_SESSION_MINUTES = 45;
const WEAK_BELOW = 0.7;
const AVERAGE_EXAM_WEIGHT = 32.5;

export interface PlanSubtopic {
  id: string;
  topicId: string;
  title: string;
  topicTitle: string;
  /** Midpoint of the topic's published weight range, for example 32.5 for 30 to 35%. */
  topicWeightMid: number;
  attempted: number;
  correct: number;
}

export interface PlanInput {
  /** ISO date, today in the learner's timezone. */
  today: string;
  /** ISO date of the exam. */
  examDate: string;
  weeklyHours: number;
  /** 0 = Sunday … 6 = Saturday */
  studyDays: number[];
  subtopics: PlanSubtopic[];
}

export interface PlannedSession {
  scheduled_for: string;
  kind: SessionKind;
  topic_id: string | null;
  subtopic_id: string | null;
  title: string;
  planned_minutes: number;
}

export interface PlanResult {
  sessions: PlannedSession[];
  warnings: string[];
  studyDays: number;
  minutesPerStudyDay: number;
  totalMinutes: number;
}

export function parseIso(iso: string): Date {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d));
}

export function toIso(date: Date): string {
  return date.toISOString().slice(0, 10);
}

export function addDays(iso: string, days: number): string {
  const d = parseIso(iso);
  d.setUTCDate(d.getUTCDate() + days);
  return toIso(d);
}

export function daysBetween(from: string, to: string): number {
  return Math.round((parseIso(to).getTime() - parseIso(from).getTime()) / 86_400_000);
}

const clamp = (n: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, n));

export function generatePlan(input: PlanInput): PlanResult {
  const days = daysBetween(input.today, input.examDate);
  if (days < 0) throw new Error('exam_date_in_past');
  if (!(input.weeklyHours >= 1 && input.weeklyHours <= 80)) throw new Error('invalid_hours');
  const studyDays = [...new Set(input.studyDays)].filter((d) => Number.isInteger(d) && d >= 0 && d <= 6).sort((a, b) => a - b);
  if (studyDays.length === 0) throw new Error('invalid_study_days');
  if (input.subtopics.length === 0) throw new Error('no_subtopics');

  const warnings: string[] = [];
  const slots: string[] = [];
  for (let i = 0; i < days; i++) {
    const iso = addDays(input.today, i);
    if (studyDays.includes(parseIso(iso).getUTCDay())) slots.push(iso);
  }
  if (slots.length === 0) {
    return {
      sessions: [],
      warnings: ['Your exam is too soon for sessions on your chosen study days. Study on any day you can before the exam.'],
      studyDays: 0,
      minutesPerStudyDay: 0,
      totalMinutes: 0,
    };
  }

  const minutesPerStudyDay = (input.weeklyHours * 60) / studyDays.length;
  const sessionsPerDay = Math.max(1, Math.floor(minutesPerStudyDay / TARGET_SESSION_MINUTES));
  const sessionMinutes = clamp(Math.round(minutesPerStudyDay / sessionsPerDay / 5) * 5, MIN_SESSION_MINUTES, MAX_SESSION_MINUTES);
  if (minutesPerStudyDay < 2 * MIN_SESSION_MINUTES) {
    warnings.push('Your weekly hours are low, so sessions are short. Regular short sessions still help.');
  }
  if (days < 7) warnings.push('Your exam is less than a week away, so the plan focuses on review and practice quizzes.');

  // Priority weight: unseen areas count as 50% accuracy. Weaker areas and bigger exam areas get more sessions.
  const subs = input.subtopics;
  const weights = subs.map((s) => {
    const acc = s.attempted > 0 ? s.correct / s.attempted : 0.5;
    return (1 + 2 * (1 - acc)) * (s.topicWeightMid / AVERAGE_EXAM_WEIGHT);
  });
  const weightSum = weights.reduce((a, b) => a + b, 0);

  const totalSessions = slots.length * sessionsPerDay;
  const assigned = subs.map(() => 0);
  const picks: number[] = [];
  for (let s = 0; s < totalSessions; s++) {
    let best = 0;
    let bestGap = -Infinity;
    for (let i = 0; i < subs.length; i++) {
      const gap = ((weights[i] / weightSum) * (s + 1)) - assigned[i];
      if (gap > bestGap + 1e-9) {
        bestGap = gap;
        best = i;
      }
    }
    assigned[best] += 1;
    picks.push(best);
  }

  const cycle = subs.map(() => 0);
  const sessions: PlannedSession[] = picks.map((i, s) => {
    const sub = subs[i];
    const acc = sub.attempted > 0 ? sub.correct / sub.attempted : null;
    let kind: SessionKind;
    if (acc === null) kind = 'learn';
    else if (acc < WEAK_BELOW) kind = 'review';
    else kind = cycle[i] % 2 === 0 ? 'quiz' : 'flashcards';
    cycle[i] += 1;

    const base = { scheduled_for: slots[Math.floor(s / sessionsPerDay)], planned_minutes: sessionMinutes };
    switch (kind) {
      case 'learn':
        return { ...base, kind, topic_id: sub.topicId, subtopic_id: sub.id, title: `Learn: ${sub.title}` };
      case 'review':
        return { ...base, kind, topic_id: sub.topicId, subtopic_id: sub.id, title: `Review: ${sub.title}` };
      case 'quiz':
        return { ...base, kind, topic_id: sub.topicId, subtopic_id: sub.id, title: `Quiz: ${sub.topicTitle}` };
      default:
        return { ...base, kind: 'flashcards' as const, topic_id: sub.topicId, subtopic_id: sub.id, title: `Flashcards: ${sub.title}` };
    }
  });

  // The final session of the last study day becomes a mock exam across all topics.
  if (sessions.length > 0) {
    const last = sessions[sessions.length - 1];
    sessions[sessions.length - 1] = { ...last, kind: 'mock', topic_id: null, subtopic_id: null, title: 'Mock: mixed quiz' };
  }

  return {
    sessions,
    warnings,
    studyDays: slots.length,
    minutesPerStudyDay: Math.round(minutesPerStudyDay),
    totalMinutes: sessions.length * sessionMinutes,
  };
}

/** Maps planned sessions to the shape save_study_plan expects (subtopic ids are not stored). */
export function toSavePayload(sessions: PlannedSession[]) {
  return sessions.map((s) => ({
    scheduled_for: s.scheduled_for,
    kind: s.kind,
    topic_id: s.topic_id,
    title: s.title,
    planned_minutes: s.planned_minutes,
  }));
}
