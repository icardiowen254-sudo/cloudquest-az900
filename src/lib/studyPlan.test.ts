import { describe, expect, it } from 'vitest';
import { addDays, daysBetween, generatePlan, toSavePayload, type PlanSubtopic } from './studyPlan';

const sub = (id: string, topicId: string, attempted = 0, correct = 0, mid = 32.5): PlanSubtopic => ({
  id,
  topicId,
  title: `Sub ${id}`,
  topicTitle: `Topic ${topicId}`,
  topicWeightMid: mid,
  attempted,
  correct,
});

const subtopics = [
  sub('s1', 't1', 4, 1, 27.5),
  sub('s2', 't1', 0, 0, 27.5),
  sub('s3', 't2', 5, 5, 37.5),
  sub('s4', 't3', 4, 2, 32.5),
];

describe('generatePlan', () => {
  it('only schedules on the chosen weekdays and before the exam', () => {
    // 2026-10-19 is a Monday. Study Monday, Wednesday and Friday for two weeks before 2026-11-02.
    const plan = generatePlan({ today: '2026-10-19', examDate: '2026-11-02', weeklyHours: 6, studyDays: [1, 3, 5], subtopics });
    expect(plan.sessions.length).toBeGreaterThan(0);
    for (const s of plan.sessions) {
      const wd = new Date(`${s.scheduled_for}T00:00:00Z`).getUTCDay();
      expect([1, 3, 5]).toContain(wd);
      expect(s.scheduled_for >= '2026-10-19' && s.scheduled_for < '2026-11-02').toBe(true);
    }
  });

  it('keeps total planned time close to the weekly hours over the study window', () => {
    const plan = generatePlan({ today: '2026-10-19', examDate: '2026-11-02', weeklyHours: 6, studyDays: [1, 3, 5], subtopics });
    const weeks = plan.studyDays / 3;
    const expected = 6 * 60 * weeks;
    expect(Math.abs(plan.totalMinutes - expected)).toBeLessThanOrEqual(expected * 0.1);
  });

  it('gives weaker and unseen areas more sessions than strong ones', () => {
    const plan = generatePlan({ today: '2026-10-19', examDate: '2026-12-01', weeklyHours: 8, studyDays: [0, 1, 2, 3, 4, 5, 6], subtopics });
    const count = (id: string) => plan.sessions.filter((s) => s.subtopic_id === id).length;
    expect(count('s3')).toBeLessThan(count('s1'));
    expect(count('s3')).toBeLessThan(count('s2'));
  });

  it('puts review sessions on weak areas and learning sessions on unseen areas', () => {
    const plan = generatePlan({ today: '2026-10-19', examDate: '2026-12-01', weeklyHours: 8, studyDays: [1, 3], subtopics });
    expect(plan.sessions.some((s) => s.subtopic_id === 's1' && s.kind === 'review')).toBe(true);
    expect(plan.sessions.some((s) => s.subtopic_id === 's2' && s.kind === 'learn')).toBe(true);
  });

  it('finishes with a mixed mock exam quiz', () => {
    const plan = generatePlan({ today: '2026-10-19', examDate: '2026-11-02', weeklyHours: 5, studyDays: [1, 3, 5], subtopics });
    const last = plan.sessions[plan.sessions.length - 1];
    expect(last.kind).toBe('mock');
    expect(last.topic_id).toBeNull();
  });

  it('keeps session lengths within bounds and based on the weekly hours', () => {
    // One hour a week across seven days is about 9 minutes a day, which is below the 30-minute threshold
    const light = generatePlan({ today: '2026-10-19', examDate: '2026-11-02', weeklyHours: 1, studyDays: [0, 1, 2, 3, 4, 5, 6], subtopics });
    expect(light.warnings.join(' ')).toMatch(/low/);
    for (const s of light.sessions) {
      expect(s.planned_minutes).toBeGreaterThanOrEqual(15);
      expect(s.planned_minutes).toBeLessThanOrEqual(120);
    }
    const heavy = generatePlan({ today: '2026-10-19', examDate: '2026-11-02', weeklyHours: 30, studyDays: [1, 2, 3, 4, 5], subtopics });
    expect(heavy.sessions.every((s) => s.planned_minutes <= 120)).toBe(true);
  });

  it('warns when the exam is very close, and still plans what fits', () => {
    const plan = generatePlan({ today: '2026-10-19', examDate: '2026-10-22', weeklyHours: 5, studyDays: [1, 2, 3, 4, 5, 6, 0], subtopics });
    expect(plan.warnings.join(' ')).toMatch(/less than a week/);
    expect(plan.sessions.length).toBeGreaterThan(0);
  });

  it('returns no sessions with a clear message when no study day fits before the exam', () => {
    const plan = generatePlan({ today: '2026-10-19', examDate: '2026-10-20', weeklyHours: 5, studyDays: [3], subtopics });
    expect(plan.sessions).toHaveLength(0);
    expect(plan.warnings[0]).toMatch(/too soon/);
  });

  it('refuses a past exam date, impossible hours, empty study days and no subtopics', () => {
    expect(() => generatePlan({ today: '2026-10-19', examDate: '2026-10-18', weeklyHours: 5, studyDays: [1], subtopics })).toThrow('exam_date_in_past');
    expect(() => generatePlan({ today: '2026-10-19', examDate: '2026-11-02', weeklyHours: 0, studyDays: [1], subtopics })).toThrow('invalid_hours');
    expect(() => generatePlan({ today: '2026-10-19', examDate: '2026-11-02', weeklyHours: 5, studyDays: [], subtopics })).toThrow('invalid_study_days');
    expect(() => generatePlan({ today: '2026-10-19', examDate: '2026-11-02', weeklyHours: 5, studyDays: [1], subtopics: [] })).toThrow('no_subtopics');
  });

  it('is deterministic: the same inputs give the same plan', () => {
    const input = { today: '2026-10-19', examDate: '2026-11-30', weeklyHours: 7, studyDays: [2, 4, 6], subtopics };
    expect(generatePlan(input)).toEqual(generatePlan(input));
  });

  it('produces a payload the database function accepts (no extra fields)', () => {
    const plan = generatePlan({ today: '2026-10-19', examDate: '2026-11-02', weeklyHours: 5, studyDays: [1, 3], subtopics });
    const payload = toSavePayload(plan.sessions);
    expect(Object.keys(payload[0]).sort()).toEqual(['kind', 'planned_minutes', 'scheduled_for', 'title', 'topic_id']);
  });

  it('date helpers behave across month ends', () => {
    expect(addDays('2026-10-31', 1)).toBe('2026-11-01');
    expect(daysBetween('2026-10-19', '2026-11-02')).toBe(14);
  });
});
