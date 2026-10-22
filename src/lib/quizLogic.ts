import type {
  CatalogQuestion,
  Difficulty,
  QuestionKind,
  QuestionReview,
  RunQuestion,
  SubtopicPerformance,
} from './quizTypes';

export const COUNT_CHOICES = [5, 10, 20] as const;
export const DIFFICULTIES: Difficulty[] = ['easy', 'medium', 'hard'];
export const MAX_QUESTIONS = 60;
/** Below these sample sizes the dashboard says "not enough practice data yet" instead of judging a topic. */
export const MIN_ANSWERS_TOPIC = 5;
export const MIN_ANSWERS_SUBTOPIC = 3;
/** Accuracy under this value counts as "needs more practice". */
export const WEAK_THRESHOLD = 0.7;

export function difficultyLabel(d: Difficulty | null): string {
  return d === null ? 'Any difficulty' : d.charAt(0).toUpperCase() + d.slice(1);
}

export function accuracy(correct: number, attempted: number): number | null {
  return attempted > 0 ? correct / attempted : null;
}

export function percentLabel(value: number | null): string {
  return value === null ? '–' : `${Math.round(value * 100)}%`;
}

/** Single-answer questions replace the selection; multiple-answer questions toggle each option. */
export function toggleSelection(kind: QuestionKind, current: string[], optionId: string): string[] {
  if (kind === 'single') return [optionId];
  return current.includes(optionId) ? current.filter((id) => id !== optionId) : [...current, optionId];
}

/** Questions with no selection that the server has not already locked. */
export function countUnanswered(questions: Pick<RunQuestion, 'selected' | 'locked'>[]): number {
  return questions.filter((q) => !q.locked && q.selected.length === 0).length;
}

/** Only answers the server has not locked are sent at submit time. */
export function buildSubmitPayload(
  questions: Pick<RunQuestion, 'questionId' | 'selected' | 'locked'>[],
): { question_id: string; option_ids: string[] }[] {
  return questions
    .filter((q) => !q.locked && q.selected.length > 0)
    .map((q) => ({ question_id: q.questionId, option_ids: q.selected }));
}

export function availableCount(catalog: CatalogQuestion[], topicId: string | null, difficulty: Difficulty | null): number {
  return catalog.filter(
    (q) => (topicId === null || q.topicId === topicId) && (difficulty === null || q.difficulty === difficulty),
  ).length;
}

/** What the server will actually draw: the request, capped by how many questions match. */
export function effectiveCount(requested: number, available: number): number {
  return Math.max(0, Math.min(requested, available, MAX_QUESTIONS));
}

export interface TopicRollup {
  topicId: string;
  slug: string;
  title: string;
  attempted: number;
  correct: number;
  accuracy: number | null;
}

export function rollUpByTopic(rows: SubtopicPerformance[]): TopicRollup[] {
  const byTopic = new Map<string, TopicRollup>();
  for (const r of rows) {
    const current = byTopic.get(r.topic_id) ?? {
      topicId: r.topic_id,
      slug: r.topic_slug,
      title: r.topic_title,
      attempted: 0,
      correct: 0,
      accuracy: null,
    };
    current.attempted += r.attempted;
    current.correct += r.correct;
    byTopic.set(r.topic_id, current);
  }
  return [...byTopic.values()].map((t) => ({ ...t, accuracy: accuracy(t.correct, t.attempted) }));
}

export function overallTotals(rows: SubtopicPerformance[]): { attempted: number; correct: number; accuracy: number | null } {
  const attempted = rows.reduce((n, r) => n + r.attempted, 0);
  const correct = rows.reduce((n, r) => n + r.correct, 0);
  return { attempted, correct, accuracy: accuracy(correct, attempted) };
}

/** Subtopics with enough answers to judge and an accuracy under the threshold, weakest first. */
export function weakestSubtopics(
  rows: SubtopicPerformance[],
  options: { minAnswers?: number; threshold?: number; limit?: number } = {},
): SubtopicPerformance[] {
  const { minAnswers = MIN_ANSWERS_SUBTOPIC, threshold = WEAK_THRESHOLD, limit = 3 } = options;
  return rows
    .filter((r) => r.attempted >= minAnswers && r.correct / r.attempted < threshold)
    .sort((a, b) => a.correct / a.attempted - b.correct / b.attempted || b.attempted - a.attempted)
    .slice(0, limit);
}

export type NextStep =
  | { kind: 'first-quiz' }
  | { kind: 'practise'; topicSlug: string; subtopicTitle: string; accuracy: number }
  | { kind: 'mixed' };

export function recommendNext(rows: SubtopicPerformance[]): NextStep {
  if (overallTotals(rows).attempted === 0) return { kind: 'first-quiz' };
  const weakest = weakestSubtopics(rows, { limit: 1 })[0];
  if (weakest) {
    return {
      kind: 'practise',
      topicSlug: weakest.topic_slug,
      subtopicTitle: weakest.subtopic_title,
      accuracy: weakest.correct / weakest.attempted,
    };
  }
  return { kind: 'mixed' };
}

export interface ResultTopicRow {
  topicTitle: string;
  correct: number;
  total: number;
}

export function resultByTopic(answers: Pick<QuestionReview, 'topic_title' | 'is_correct'>[]): ResultTopicRow[] {
  const rows = new Map<string, ResultTopicRow>();
  for (const a of answers) {
    const row = rows.get(a.topic_title) ?? { topicTitle: a.topic_title, correct: 0, total: 0 };
    row.total += 1;
    if (a.is_correct) row.correct += 1;
    rows.set(a.topic_title, row);
  }
  return [...rows.values()];
}
