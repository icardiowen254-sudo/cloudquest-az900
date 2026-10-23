import { describe, expect, it } from 'vitest';
import { STATUS_LABEL, calculateReadiness, type ReadinessAttempt } from './readiness';
import type { SubtopicPerformance } from './quizTypes';

const now = new Date('2026-10-20T12:00:00Z');
const topics = [
  { id: 't1', title: 'Cloud concepts', weight_min: 25, weight_max: 30 },
  { id: 't2', title: 'Architecture', weight_min: 35, weight_max: 40 },
  { id: 't3', title: 'Management', weight_min: 30, weight_max: 35 },
];

const perf = (topicId: string, subId: string, attempted: number, correct: number): SubtopicPerformance => ({
  topic_id: topicId,
  topic_slug: topicId,
  topic_title: topicId,
  subtopic_id: subId,
  subtopic_slug: subId,
  subtopic_title: subId,
  attempted,
  correct,
  last_practised_at: null,
});

// Eleven subtopics in total, spread across three topics
const fullCoverage = [
  perf('t1', 'a', 4, 4), perf('t1', 'b', 4, 4), perf('t1', 'c', 4, 4),
  perf('t2', 'd', 4, 4), perf('t2', 'e', 4, 4), perf('t2', 'f', 4, 4), perf('t2', 'g', 4, 4),
  perf('t3', 'h', 4, 4), perf('t3', 'i', 4, 4), perf('t3', 'j', 4, 4), perf('t3', 'k', 4, 4),
];

const attempts = (...scores: [number, number][]): ReadinessAttempt[] =>
  scores.map(([c, q], i) => ({
    correct_count: c,
    question_count: q,
    completed_at: new Date(now.getTime() - i * 86_400_000).toISOString(),
  }));

describe('calculateReadiness: honesty first', () => {
  it('shows no score and says why with a brand-new learner', () => {
    const r = calculateReadiness({ topics, performance: [], totalSubtopics: 11, attempts: [], now });
    expect(r.status).toBe('insufficient');
    expect(r.score).toBeNull();
    expect(r.actions[0]).toMatch(/first reading/);
    expect(STATUS_LABEL[r.status]).toBe('Not enough practice data yet');
  });

  it('stays insufficient with a few perfect answers in one area', () => {
    const r = calculateReadiness({
      topics,
      performance: [perf('t1', 'a', 5, 5)],
      totalSubtopics: 11,
      attempts: attempts([5, 5]),
      now,
    });
    expect(r.status).toBe('insufficient');
    expect(r.score).toBeNull();
    expect(r.reasons.join(' ')).toMatch(/more skill areas/);
  });

  it('needs at least 20 answers even with broad coverage', () => {
    const thin = fullCoverage.map((p) => ({ ...p, attempted: 3, correct: 3 }));
    const r = calculateReadiness({ topics, performance: thin, totalSubtopics: 11, attempts: [], now });
    expect(r.answers).toBe(33);
    expect(r.status).not.toBe('insufficient');
    const tooFew = fullCoverage.slice(0, 5).map((p) => ({ ...p, attempted: 3, correct: 3 }));
    expect(calculateReadiness({ topics, performance: tooFew, totalSubtopics: 11, attempts: [], now }).status).toBe('insufficient');
  });
});

describe('calculateReadiness: bands and weighting', () => {
  it('reports Strong when practice accuracy is high across all areas', () => {
    const r = calculateReadiness({ topics, performance: fullCoverage, totalSubtopics: 11, attempts: attempts([44, 44]), now });
    expect(r.status).toBe('strong');
    expect(r.score).toBeCloseTo(1, 5);
  });

  it('reports Building when accuracy is low, using the weighted average', () => {
    const poor = fullCoverage.map((p) => ({ ...p, correct: 1 }));
    const r = calculateReadiness({ topics, performance: poor, totalSubtopics: 11, attempts: [], now });
    expect(r.status).toBe('building');
    expect(r.score).toBeCloseTo(0.25, 5);
  });

  it('weights bigger exam areas more heavily', () => {
    // Cloud concepts (27.5) scores 100%, Architecture (37.5) scores 0%, Management (32.5) scores 100%
    const skewed = fullCoverage.map((p) => {
      if (p.topic_id === 't2') return { ...p, correct: 0 };
      return p;
    });
    const r = calculateReadiness({ topics, performance: skewed, totalSubtopics: 11, attempts: [], now });
    const unweighted = (100 + 0 + 100) / 3 / 100;
    expect(r.score as number).toBeLessThan(unweighted);
  });

  it('ignores an area that has fewer than 5 answers when scoring', () => {
    // Architecture has only 4 answers in total (below the 5-answer rule), all wrong. It must not drag the score down.
    const data = [...fullCoverage.filter((p) => p.topic_id !== 't2'), perf('t2', 'd', 4, 0)];
    const r = calculateReadiness({ topics, performance: data, totalSubtopics: 11, attempts: [], now });
    const t2 = r.topics.find((t) => t.topicId === 't2');
    expect(t2?.meetsSample).toBe(false);
    expect(r.score).toBeCloseTo(1, 5);
  });
});

describe('calculateReadiness: trend, recency and guidance', () => {
  it('detects an upward trend from the newest quiz', () => {
    const r = calculateReadiness({ topics, performance: fullCoverage, totalSubtopics: 11, attempts: attempts([9, 10], [5, 10], [5, 10]), now });
    expect(r.trend).toBe('up');
  });

  it('detects a downward trend and advises reviewing explanations', () => {
    const r = calculateReadiness({ topics, performance: fullCoverage, totalSubtopics: 11, attempts: attempts([4, 10], [8, 10], [9, 10]), now });
    expect(r.trend).toBe('down');
    expect(r.actions.join(' ')).toMatch(/explanations/);
  });

  it('shows no trend with fewer than three quizzes', () => {
    const r = calculateReadiness({ topics, performance: fullCoverage, totalSubtopics: 11, attempts: attempts([9, 10], [5, 10]), now });
    expect(r.trend).toBeNull();
  });

  it('flags practice that has gone stale', () => {
    const old = [{ correct_count: 9, question_count: 10, completed_at: new Date(now.getTime() - 20 * 86_400_000).toISOString() }];
    const r = calculateReadiness({ topics, performance: fullCoverage, totalSubtopics: 11, attempts: old, now });
    expect(r.daysSincePractice).toBe(20);
    expect(r.actions.join(' ')).toMatch(/two weeks/);
  });

  it('names the weakest area first in the actions', () => {
    const mixed = fullCoverage.map((p) => (p.topic_id === 't3' ? { ...p, correct: 0 } : p));
    const r = calculateReadiness({ topics, performance: mixed, totalSubtopics: 11, attempts: [], now });
    expect(r.needsPractice).toContain('Management');
    expect(r.actions.join(' ')).toMatch(/Management/);
  });
});
