import { friendlyDbError } from './errors';
import type { GoalsForm } from './goals';
import { supabase } from './supabase';

/** Saves the learner's goals. Authorization is enforced by RLS; the database CHECK constraints validate values again. */
export async function saveGoals(
  userId: string,
  form: GoalsForm,
  options: { markOnboarded?: boolean } = {},
): Promise<void> {
  const { data, error } = await supabase
    .from('profiles')
    .update({
      display_name: form.displayName.trim(),
      exam_date: form.examDate || null,
      weekly_study_hours: form.weeklyHours,
      study_days: [...form.studyDays].sort((a, b) => a - b),
      explanation_style: form.explanationStyle,
      local_examples: form.localExamples,
      ...(options.markOnboarded ? { onboarded_at: new Date().toISOString() } : {}),
    })
    .eq('id', userId)
    .select('id');

  if (error) throw new Error(friendlyDbError(error.message));
  if (!data || data.length !== 1) throw new Error('Your profile could not be saved. Log out, log in again and retry.');
}
