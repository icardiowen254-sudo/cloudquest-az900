import { MIN_PASSWORD_LENGTH } from './constants';

/** Turns provider error text into a safe, actionable message. Raw text is never shown to learners. */
export function friendlyAuthError(message: string): string {
  const m = message.toLowerCase();
  if (m.includes('invalid login credentials')) return 'That email and password do not match. Check them and try again.';
  if (m.includes('email not confirmed')) return 'Confirm your email first. Open the link we sent you, then log in.';
  if (m.includes('already registered') || m.includes('already been registered')) {
    return 'An account with this email already exists. Try logging in instead.';
  }
  if (m.includes('rate limit') || m.includes('too many') || m.includes('security purposes')) {
    return 'Too many attempts. Wait a minute, then try again.';
  }
  if (m.includes('different from the old password')) return 'Choose a password you have not used before.';
  if (m.includes('password') && (m.includes('least') || m.includes('weak') || m.includes('characters'))) {
    return `Choose a stronger password with at least ${MIN_PASSWORD_LENGTH} characters.`;
  }
  if (m.includes('failed to fetch') || m.includes('network')) {
    return 'Could not reach the server. Check your connection and try again.';
  }
  if (m.includes('provider is not enabled') || m.includes('unsupported provider')) {
    return 'Google sign-in is not enabled for this project yet.';
  }
  console.error('[cloudquest] auth error:', message);
  return 'Something went wrong. Please try again.';
}

export function friendlyDbError(message: string): string {
  const m = message.toLowerCase();
  if (m.includes('schema cache') || m.includes('does not exist')) {
    return 'The CloudQuest database tables are missing. Run supabase/migrations/0001_schema.sql in your Supabase project, then reload.';
  }
  if (m.includes('failed to fetch') || m.includes('network')) {
    return 'Could not reach the server. Check your connection and try again.';
  }
  if (m.includes('check constraint')) return 'One of the values is outside the allowed range. Check your entries and try again.';
  if (m.includes('jwt')) return 'Your session has expired. Log in again.';
  console.error('[cloudquest] database error:', message);
  return 'Something went wrong while talking to the database. Please try again.';
}

/** Maps the quiz engine's short error codes (raised by the database functions) to friendly text. */
export function friendlyQuizError(message: string): string {
  const code = message.trim();
  const known: Record<string, string> = {
    no_questions_available: 'There are no questions for that combination yet. Try another topic or difficulty.',
    invalid_mode: 'Those quiz settings are not valid. Adjust them and try again.',
    invalid_topic: 'Those quiz settings are not valid. Adjust them and try again.',
    invalid_difficulty: 'Those quiz settings are not valid. Adjust them and try again.',
    invalid_question_count: 'Those quiz settings are not valid. Adjust them and try again.',
    invalid_feedback: 'Those quiz settings are not valid. Adjust them and try again.',
    attempt_not_found: 'We could not find that quiz. It may have expired or belong to another account.',
    attempt_already_completed: 'That quiz has already been submitted.',
    attempt_not_completed: 'Finish the quiz to see its results.',
    question_already_answered: 'You have already checked that question.',
    question_not_in_attempt: 'That question is not part of this quiz.',
    no_option_selected: 'Choose an answer first.',
    invalid_option: 'One of the answers was not valid. Reload the quiz and try again.',
    too_many_options: 'This question takes a single answer. Choose one option.',
    invalid_answers: 'One of the answers was not valid. Reload the quiz and try again.',
    instant_feedback_disabled: 'This quiz reveals answers when you finish.',
    not_authenticated: 'Your session has expired. Log in again.',
  };
  return known[code] ?? friendlyDbError(message);
}
