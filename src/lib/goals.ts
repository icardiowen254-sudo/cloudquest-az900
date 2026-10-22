import type { ExplanationStyle, Profile } from '../types';

export interface GoalsForm {
  displayName: string;
  /** ISO date (YYYY-MM-DD), or an empty string when no exam is booked. */
  examDate: string;
  weeklyHours: number;
  /** 0 = Sunday … 6 = Saturday */
  studyDays: number[];
  explanationStyle: ExplanationStyle;
  localExamples: boolean;
}

export type GoalsField = 'displayName' | 'examDate' | 'weeklyHours' | 'studyDays';
export type GoalsErrors = Partial<Record<GoalsField, string>>;

export const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'] as const;
export const DEFAULT_STUDY_DAYS = [1, 2, 3, 4, 5];

export function todayISO(now: Date = new Date()): string {
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  return `${now.getFullYear()}-${month}-${day}`;
}

function isRealDate(iso: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(iso)) return false;
  const [y, m, d] = iso.split('-').map(Number);
  const date = new Date(Date.UTC(y, m - 1, d));
  return date.getUTCFullYear() === y && date.getUTCMonth() === m - 1 && date.getUTCDate() === d;
}

export function validateGoals(form: GoalsForm, now: Date = new Date()): GoalsErrors {
  const errors: GoalsErrors = {};

  const name = form.displayName.trim();
  if (name.length === 0) errors.displayName = 'Enter the name you want us to use.';
  else if (name.length > 60) errors.displayName = 'Use 60 characters or fewer.';

  if (form.examDate) {
    if (!isRealDate(form.examDate)) errors.examDate = 'Enter a valid date.';
    else if (form.examDate < todayISO(now)) {
      errors.examDate = 'Pick today or a later date, or leave this blank if you have not booked yet.';
    }
  }

  if (!Number.isFinite(form.weeklyHours) || form.weeklyHours < 1 || form.weeklyHours > 80) {
    errors.weeklyHours = 'Enter between 1 and 80 hours a week.';
  }
  if (form.studyDays.length === 0) errors.studyDays = 'Choose at least one study day.';

  return errors;
}

export const hasErrors = (errors: GoalsErrors): boolean => Object.keys(errors).length > 0;

/** Whole days from today (local) to the given ISO date. Negative when the date has passed. */
export function daysUntil(iso: string, now: Date = new Date()): number {
  const [y, m, d] = iso.split('-').map(Number);
  const target = Date.UTC(y, m - 1, d);
  const today = Date.UTC(now.getFullYear(), now.getMonth(), now.getDate());
  return Math.round((target - today) / 86_400_000);
}

export function formatDate(iso: string): string {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(y, m - 1, d).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
}

export function formFromProfile(profile: Profile): GoalsForm {
  return {
    displayName: profile.display_name,
    examDate: profile.exam_date ?? '',
    weeklyHours: profile.weekly_study_hours ?? 5,
    studyDays: profile.study_days?.length ? [...profile.study_days] : [...DEFAULT_STUDY_DAYS],
    explanationStyle: profile.explanation_style,
    localExamples: profile.local_examples,
  };
}
