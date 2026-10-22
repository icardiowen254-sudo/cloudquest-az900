export type ExplanationStyle = 'simple' | 'detailed';

export interface Profile {
  id: string;
  display_name: string;
  /** ISO date (YYYY-MM-DD) or null when no exam is booked. */
  exam_date: string | null;
  weekly_study_hours: number | null;
  /** 0 = Sunday … 6 = Saturday */
  study_days: number[];
  explanation_style: ExplanationStyle;
  local_examples: boolean;
  onboarded_at: string | null;
}
