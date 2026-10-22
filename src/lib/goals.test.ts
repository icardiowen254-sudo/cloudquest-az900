import { describe, expect, it } from 'vitest';
import { daysUntil, formFromProfile, hasErrors, todayISO, validateGoals, type GoalsForm } from './goals';

const now = new Date(2026, 9, 20); // 20 October 2026, local time

const valid: GoalsForm = {
  displayName: 'Amina',
  examDate: '2026-11-15',
  weeklyHours: 6,
  studyDays: [1, 3, 5],
  explanationStyle: 'simple',
  localExamples: true,
};

describe('validateGoals', () => {
  it('accepts a complete, valid form', () => {
    expect(hasErrors(validateGoals(valid, now))).toBe(false);
  });

  it('allows a blank exam date (not booked yet)', () => {
    expect(validateGoals({ ...valid, examDate: '' }, now).examDate).toBeUndefined();
  });

  it('rejects an empty or over-long name', () => {
    expect(validateGoals({ ...valid, displayName: '   ' }, now).displayName).toBeDefined();
    expect(validateGoals({ ...valid, displayName: 'x'.repeat(61) }, now).displayName).toBeDefined();
    expect(validateGoals({ ...valid, displayName: 'x'.repeat(60) }, now).displayName).toBeUndefined();
  });

  it('rejects past dates but accepts today', () => {
    expect(validateGoals({ ...valid, examDate: '2026-10-19' }, now).examDate).toBeDefined();
    expect(validateGoals({ ...valid, examDate: '2026-10-20' }, now).examDate).toBeUndefined();
  });

  it('rejects impossible calendar dates', () => {
    expect(validateGoals({ ...valid, examDate: '2026-02-31' }, now).examDate).toBeDefined();
    expect(validateGoals({ ...valid, examDate: 'next week' }, now).examDate).toBeDefined();
  });

  it('keeps weekly hours between 1 and 80', () => {
    expect(validateGoals({ ...valid, weeklyHours: 0.5 }, now).weeklyHours).toBeDefined();
    expect(validateGoals({ ...valid, weeklyHours: 81 }, now).weeklyHours).toBeDefined();
    expect(validateGoals({ ...valid, weeklyHours: NaN }, now).weeklyHours).toBeDefined();
    expect(validateGoals({ ...valid, weeklyHours: 80 }, now).weeklyHours).toBeUndefined();
  });

  it('requires at least one study day', () => {
    expect(validateGoals({ ...valid, studyDays: [] }, now).studyDays).toBeDefined();
  });
});

describe('date helpers', () => {
  it('formats today as an ISO date', () => {
    expect(todayISO(now)).toBe('2026-10-20');
  });

  it('counts whole days until a date', () => {
    expect(daysUntil('2026-10-20', now)).toBe(0);
    expect(daysUntil('2026-10-30', now)).toBe(10);
    expect(daysUntil('2026-10-19', now)).toBe(-1);
  });
});

describe('formFromProfile', () => {
  it('falls back to sensible defaults for a new profile', () => {
    const form = formFromProfile({
      id: 'u1',
      display_name: '',
      exam_date: null,
      weekly_study_hours: null,
      study_days: [],
      explanation_style: 'simple',
      local_examples: true,
      onboarded_at: null,
    });
    expect(form.examDate).toBe('');
    expect(form.weeklyHours).toBe(5);
    expect(form.studyDays).toEqual([1, 2, 3, 4, 5]);
  });
});
