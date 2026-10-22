-- DEV ONLY. Removes every CloudQuest table and function so migration 0001 can be re-run.
-- Learner accounts in auth.users are kept; their profile rows are re-created on next login.
drop trigger if exists on_auth_user_created on auth.users;
drop table if exists
  public.activity_log, public.ai_messages, public.ai_conversations,
  public.study_sessions, public.study_plans,
  public.flashcard_reviews, public.flashcard_states, public.flashcards,
  public.attempt_answers, public.quiz_attempts,
  public.option_solutions, public.question_solutions, public.answer_options, public.questions,
  public.subtopics, public.topics, public.profiles
  cascade;
drop function if exists public.handle_new_user();
drop function if exists public.set_updated_at();
