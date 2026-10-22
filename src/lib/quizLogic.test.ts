import { describe, expect, it } from 'vitest';
import {
  accuracy,
  availableCount,
  buildSubmitPayload,
  countUnanswered,
  effectiveCount,
  overallTotals,
  percentLabel,
  recommendNext,
  resultByTopic,
  rollUpByTopic,
  toggleSelection,
  weakestSubtopics,
} from './quizLogic';
import type { CatalogQuestion, SubtopicPerformance } from './quizTypes';

const row = (over: Partial<SubtopicPerformance>): SubtopicPerformance => ({
  topic_id: 't1',
  topic_slug: 'cloud-concepts',
  topic_title: 'Cloud concepts',
  subtopic_id: 's1',
  subtopic_slug: 'cloud-computing',
  subtopic_title: 'Cloud computing',
  attempted: 0,
  correct: 0,
  last_practised_at: null,
  ...over,
});

describe('scores', () => {
  it('computes accuracy and refuses to divide by zero', () => {
    expect(accuracy(3, 4)).toBe(0.75);
    expect(accuracy(0, 0)).toBeNull();
    expect(percentLabel(0.756)).toBe('76%');
    expect(percentLabel(null)).toBe('–');
  });
});

describe('answer selection', () => {
  it('replaces the choice for single-answer questions', () => {
    expect(toggleSelection('single', ['a'], 'b')).toEqual(['b']);
  });

  it('toggles options for multiple-answer questions', () => {
    expect(toggleSelection('multiple', ['a'], 'b')).toEqual(['a', 'b']);
    expect(toggleSelection('multiple', ['a', 'b'], 'a')).toEqual(['b']);
  });

  it('counts unanswered questions, ignoring ones the server has locked', () => {
    const qs = [
      { selected: [], locked: false },
      { selected: ['x'], locked: false },
      { selected: [], locked: true },
    ];
    expect(countUnanswered(qs)).toBe(1);
  });

  it('sends only unlocked, answered questions when submitting', () => {
    const qs = [
      { questionId: 'q1', selected: ['a'], locked: false },
      { questionId: 'q2', selected: [], locked: false },
      { questionId: 'q3', selected: ['c'], locked: true },
    ];
    expect(buildSubmitPayload(qs)).toEqual([{ question_id: 'q1', option_ids: ['a'] }]);
  });
});

describe('quiz setup', () => {
  const catalog: CatalogQuestion[] = [
    { id: '1', difficulty: 'easy', topicId: 't1' },
    { id: '2', difficulty: 'hard', topicId: 't1' },
    { id: '3', difficulty: 'easy', topicId: 't2' },
  ];

  it('counts questions for a topic and difficulty', () => {
    expect(availableCount(catalog, null, null)).toBe(3);
    expect(availableCount(catalog, 't1', null)).toBe(2);
    expect(availableCount(catalog, 't1', 'easy')).toBe(1);
    expect(availableCount(catalog, 't2', 'hard')).toBe(0);
  });

  it('caps the requested count at what is available', () => {
    expect(effectiveCount(10, 4)).toBe(4);
    expect(effectiveCount(5, 20)).toBe(5);
    expect(effectiveCount(100, 200)).toBe(60);
    expect(effectiveCount(5, 0)).toBe(0);
  });
});

describe('performance', () => {
  const rows = [
    row({ subtopic_id: 's1', subtopic_title: 'Cloud computing', attempted: 4, correct: 1 }),
    row({ subtopic_id: 's2', subtopic_title: 'Cloud benefits', attempted: 4, correct: 4 }),
    row({ subtopic_id: 's3', subtopic_title: 'Service types', attempted: 2, correct: 0 }),
    row({ topic_id: 't2', topic_slug: 'architecture-services', topic_title: 'Architecture', subtopic_id: 's4', subtopic_title: 'Storage', attempted: 3, correct: 2 }),
  ];

  it('rolls subtopics up to topics and overall', () => {
    const topics = rollUpByTopic(rows);
    expect(topics.find((t) => t.topicId === 't1')).toMatchObject({ attempted: 10, correct: 5, accuracy: 0.5 });
    expect(overallTotals(rows)).toEqual({ attempted: 13, correct: 7, accuracy: 7 / 13 });
  });

  it('lists weak subtopics only when there are enough answers', () => {
    // Cloud benefits is 100%, Service types has only 2 answers, Storage is 2 of 3 (67%, under the 70% line).
    const weak = weakestSubtopics(rows);
    expect(weak.map((r) => r.subtopic_title)).toEqual(['Cloud computing', 'Storage']);
    expect(weakestSubtopics(rows, { minAnswers: 2 }).map((r) => r.subtopic_title)).toEqual([
      'Service types',
      'Cloud computing',
      'Storage',
    ]);
    expect(weakestSubtopics(rows, { limit: 1 })).toHaveLength(1);
  });

  it('recommends a first quiz, then the weakest area, then a mixed quiz', () => {
    expect(recommendNext([])).toEqual({ kind: 'first-quiz' });
    expect(recommendNext(rows)).toMatchObject({ kind: 'practise', topicSlug: 'cloud-concepts', subtopicTitle: 'Cloud computing' });
    expect(recommendNext([row({ attempted: 5, correct: 5 })])).toEqual({ kind: 'mixed' });
  });
});

describe('result breakdown', () => {
  it('groups answers by topic', () => {
    const out = resultByTopic([
      { topic_title: 'A', is_correct: true },
      { topic_title: 'A', is_correct: false },
      { topic_title: 'B', is_correct: true },
    ]);
    expect(out).toEqual([
      { topicTitle: 'A', correct: 1, total: 2 },
      { topicTitle: 'B', correct: 1, total: 1 },
    ]);
  });
});
