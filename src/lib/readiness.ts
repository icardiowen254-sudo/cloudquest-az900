// Readiness tracker. Pure functions, so the calculation can be tested and explained.
//
// Formula (practice readiness, not an exam prediction):
//   1. Topic accuracy = correct answers / answers, per skill area, counting only areas with at least 5 answers.
//   2. Practice score = weighted average of topic accuracy, where each area's weight is the midpoint of its
//      published exam weight (for example 32.5 for 30 to 35%).
//   3. An estimate is shown only when the learner has at least 20 answers and at least 60% of subtopics
//      have at least 3 answers each. Otherwise the page says "Not enough practice data yet".
//   4. Bands: under 60% = Building, 60 to 74% = Developing, 75% and above = Strong.
//   5. Trend compares the newest quiz with the average of the previous quizzes (needs at least 3 quizzes).
//      A change of more than 10 points counts as up or down.
//
// Nothing here estimates the probability of passing the official exam.

import { rollUpByTopic } from './quizLogic';
import type { SubtopicPerformance } from './quizTypes';

export const READINESS_RULES = {
  minAnswers: 20,
  minSubtopicCoverage: 0.6,
  minAnswersPerSubtopic: 3,
  minAnswersPerTopic: 5,
  developingFrom: 0.6,
  strongFrom: 0.75,
  weakBelow: 0.7,
  strongTopicFrom: 0.75,
  trendMinQuizzes: 3,
  trendPoints: 0.1,
  staleAfterDays: 14,
} as const;

export interface ReadinessTopic {
  id: string;
  title: string;
  weight_min: number;
  weight_max: number;
}

export interface ReadinessAttempt {
  correct_count: number | null;
  question_count: number;
  completed_at: string | null;
}

export interface ReadinessInput {
  topics: ReadinessTopic[];
  performance: SubtopicPerformance[];
  totalSubtopics: number;
  /** Newest first. */
  attempts: ReadinessAttempt[];
  now: Date;
}

export type ReadinessStatus = 'insufficient' | 'building' | 'developing' | 'strong';

export interface TopicReadiness {
  topicId: string;
  title: string;
  attempted: number;
  accuracy: number | null;
  meetsSample: boolean;
  weight: number;
}

export interface ReadinessResult {
  status: ReadinessStatus;
  /** Weighted practice score. Null when there is not enough data, so it is never shown.*/
  score: number | null;
  answers: number;
  coverage: number;
  reasons: string[];
  topics: TopicReadiness[];
  strongAreas: string[];
  needsPractice: string[];
  trend: 'up' | 'down' | 'flat' | null;
  daysSincePractice: number | null;
  actions: string[];
}

export function calculateReadiness(input: ReadinessInput): ReadinessResult {
  const rules = READINESS_RULES;
  const rollups = rollUpByTopic(input.performance);
  const answers = input.performance.reduce((n, r) => n + r.attempted, 0);
  const coveredSubtopics = input.performance.filter((r) => r.attempted >= rules.minAnswersPerSubtopic).length;
  const coverage = input.totalSubtopics > 0 ? coveredSubtopics / input.totalSubtopics : 0;

  const topics: TopicReadiness[] = input.topics.map((t) => {
    const r = rollups.find((x) => x.topicId === t.id);
    const attempted = r?.attempted ?? 0;
    return {
      topicId: t.id,
      title: t.title,
      attempted,
      accuracy: r?.accuracy ?? null,
      meetsSample: attempted >= rules.minAnswersPerTopic,
      weight: (t.weight_min + t.weight_max) / 2,
    };
  });

  const qualifying = topics.filter((t) => t.meetsSample && t.accuracy !== null);
  const weightTotal = qualifying.reduce((n, t) => n + t.weight, 0);
  const weighted = qualifying.reduce((n, t) => n + t.weight * (t.accuracy as number), 0);
  const practiceScore = weightTotal > 0 ? weighted / weightTotal : null;

  const reasons: string[] = [];
  if (answers < rules.minAnswers) {
    reasons.push(`Answer at least ${rules.minAnswers} questions. You have answered ${answers}.`);
  }
  const neededSubtopics = Math.ceil(rules.minSubtopicCoverage * input.totalSubtopics) - coveredSubtopics;
  if (neededSubtopics > 0) {
    reasons.push(`Answer at least ${rules.minAnswersPerSubtopic} questions in ${neededSubtopics} more skill ${neededSubtopics === 1 ? 'area' : 'areas'}.`);
  }

  let status: ReadinessStatus = 'insufficient';
  let score: number | null = null;
  if (reasons.length === 0 && practiceScore !== null) {
    score = practiceScore;
    status = practiceScore >= rules.strongFrom ? 'strong' : practiceScore >= rules.developingFrom ? 'developing' : 'building';
  }

  const newest = input.attempts[0];
  const daysSincePractice = newest?.completed_at
    ? Math.max(0, Math.floor((input.now.getTime() - new Date(newest.completed_at).getTime()) / 86_400_000))
    : null;

  let trend: ReadinessResult['trend'] = null;
  const scored = input.attempts.filter((a) => a.correct_count !== null && a.question_count > 0);
  if (scored.length >= rules.trendMinQuizzes) {
    const latest = (scored[0].correct_count as number) / scored[0].question_count;
    const earlier = scored.slice(1);
    const earlierAvg = earlier.reduce((n, a) => n + (a.correct_count as number) / a.question_count, 0) / earlier.length;
    const diff = latest - earlierAvg;
    trend = diff > rules.trendPoints ? 'up' : diff < -rules.trendPoints ? 'down' : 'flat';
  }

  const needsPractice = [...qualifying]
    .filter((t) => (t.accuracy as number) < rules.weakBelow)
    .sort((a, b) => (a.accuracy as number) - (b.accuracy as number))
    .map((t) => t.title);
  const strongAreas = qualifying.filter((t) => (t.accuracy as number) >= rules.strongTopicFrom).map((t) => t.title);

  const actions: string[] = [];
  if (answers === 0) actions.push('Take a mixed quiz to get your first reading.');
  if (reasons.length > 0) actions.push('Keep practising across every skill area to unlock an estimate.');
  if (needsPractice.length > 0) actions.push(`Spend your next session on ${needsPractice[0]}, then check the explanations you missed.`);
  if (daysSincePractice !== null && daysSincePractice > rules.staleAfterDays) {
    actions.push('It has been more than two weeks since your last quiz. A short refresh keeps your estimate current.');
  }
  if (trend === 'down') actions.push('Your latest quiz was lower than your earlier ones. Review the explanations for the questions you missed.');
  if (actions.length === 0) actions.push('Keep up mixed quizzes so your estimate stays current.');

  return {
    status,
    score,
    answers,
    coverage,
    reasons,
    topics,
    strongAreas,
    needsPractice,
    trend,
    daysSincePractice,
    actions,
  };
}

export const STATUS_LABEL: Record<ReadinessStatus, string> = {
  insufficient: 'Not enough practice data yet',
  building: 'Building',
  developing: 'Developing',
  strong: 'Strong practice results',
};
