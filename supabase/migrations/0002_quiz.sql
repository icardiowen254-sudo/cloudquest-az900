-- CloudQuest AZ-900 · migration 0002 · quiz engine (server-side scoring)
--
-- Browsers can start, answer and submit quizzes only through the functions below. They run as
-- SECURITY DEFINER, so answer keys and explanations never leave the database before a learner is
-- allowed to see them:
--   * 'end' attempts (exam style): nothing is revealed until submit_quiz_attempt completes the attempt.
--   * 'instant' attempts (practice): check_quiz_answer reveals one question at a time, after that
--     answer has been recorded and locked.
-- Errors use short machine-readable messages (for example attempt_not_found) that the app maps to friendly text.

begin;

-- Fixes the outline date for projects that applied an earlier 0001 (no effect otherwise).
update public.topics
   set outline_version = 'skills-measured-2026-07-20'
 where outline_version = 'skills-measured-2026-01-14';

alter table public.quiz_attempts
  add column feedback text not null default 'end' check (feedback in ('instant', 'end'));

-- ── Per-subtopic performance for the signed-in learner ───────────────────
-- security_invoker makes the view obey the caller's RLS. Skipped questions count as incorrect.
create view public.user_subtopic_performance
with (security_invoker = true) as
select
  a.user_id,
  t.id    as topic_id,
  t.slug  as topic_slug,
  t.title as topic_title,
  s.id    as subtopic_id,
  s.slug  as subtopic_slug,
  s.title as subtopic_title,
  count(*)::integer as attempted,
  (count(*) filter (where aa.is_correct))::integer as correct,
  max(a.completed_at) as last_practised_at
from public.attempt_answers aa
join public.quiz_attempts a on a.id = aa.attempt_id and a.status = 'completed'
join public.questions q on q.id = aa.question_id
join public.subtopics s on s.id = q.subtopic_id
join public.topics t on t.id = s.topic_id
where aa.is_correct is not null
group by a.user_id, t.id, t.slug, t.title, s.id, s.slug, s.title;

revoke all on public.user_subtopic_performance from anon;
revoke insert, update, delete, truncate on public.user_subtopic_performance from authenticated;

-- ── Internal helpers (not callable from the API) ─────────────────────────
create function public._correct_option_ids(p_question_id uuid)
returns uuid[]
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(array_agg(o.id order by o.id), '{}'::uuid[])
  from public.answer_options o
  join public.option_solutions os on os.option_id = o.id
  where o.question_id = p_question_id and os.is_correct
$$;

-- Returns the submitted option ids that belong to the question, sorted. Raises on foreign ids or too many choices.
create function public._validated_selection(p_question_id uuid, p_option_ids uuid[])
returns uuid[]
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_input uuid[];
  v_valid uuid[];
  v_kind  text;
begin
  select coalesce(array_agg(distinct x order by x), '{}'::uuid[])
    into v_input
    from unnest(coalesce(p_option_ids, '{}'::uuid[])) as x;

  select coalesce(array_agg(o.id order by o.id), '{}'::uuid[])
    into v_valid
    from public.answer_options o
   where o.question_id = p_question_id and o.id = any (v_input);

  if cardinality(v_valid) <> cardinality(v_input) then
    raise exception 'invalid_option' using errcode = '22023';
  end if;

  select q.kind into v_kind from public.questions q where q.id = p_question_id;
  if v_kind = 'single' and cardinality(v_valid) > 1 then
    raise exception 'too_many_options' using errcode = '22023';
  end if;
  return v_valid;
end;
$$;

-- One question with its answer key, notes and explanation. Only ever called after an answer is locked.
create function public._question_review(p_question_id uuid, p_position integer, p_selected uuid[], p_is_correct boolean)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'position', p_position,
    'question_id', q.id,
    'stem', q.stem,
    'kind', q.kind,
    'difficulty', q.difficulty,
    'learning_objective', q.learning_objective,
    'topic_slug', t.slug,
    'topic_title', t.title,
    'subtopic_title', s.title,
    'explanation', qs.explanation,
    'reference_url', qs.reference_url,
    'is_correct', coalesce(p_is_correct, false),
    'selected_option_ids', to_jsonb(coalesce(p_selected, '{}'::uuid[])),
    'options', (
      select jsonb_agg(
               jsonb_build_object('id', o.id, 'position', o.position, 'body', o.body,
                                  'is_correct', os.is_correct, 'note', os.note)
               order by o.position)
        from public.answer_options o
        join public.option_solutions os on os.option_id = o.id
       where o.question_id = q.id)
  )
  from public.questions q
  join public.subtopics s on s.id = q.subtopic_id
  join public.topics t on t.id = s.topic_id
  join public.question_solutions qs on qs.question_id = q.id
  where q.id = p_question_id
$$;

-- ── Public API ───────────────────────────────────────────────────────────

-- Draws a random question set and records it. The count is capped at the number of matching questions.
create function public.start_quiz_attempt(
  p_mode text,
  p_topic_id uuid,
  p_difficulty text,
  p_question_count integer,
  p_feedback text default 'end'
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user    uuid := auth.uid();
  v_ids     uuid[];
  v_count   integer;
  v_attempt uuid;
begin
  if v_user is null then
    raise exception 'not_authenticated' using errcode = '28000';
  end if;
  if p_mode is null or p_mode not in ('topic', 'mixed') then
    raise exception 'invalid_mode' using errcode = '22023';
  end if;
  if p_feedback is null or p_feedback not in ('instant', 'end') then
    raise exception 'invalid_feedback' using errcode = '22023';
  end if;
  if p_difficulty is not null and p_difficulty not in ('easy', 'medium', 'hard') then
    raise exception 'invalid_difficulty' using errcode = '22023';
  end if;
  if p_question_count is null or p_question_count < 1 or p_question_count > 60 then
    raise exception 'invalid_question_count' using errcode = '22023';
  end if;
  if p_mode = 'topic' then
    if p_topic_id is null or not exists (select 1 from public.topics t where t.id = p_topic_id) then
      raise exception 'invalid_topic' using errcode = '22023';
    end if;
  else
    p_topic_id := null;
  end if;

  -- Housekeeping: drop attempts that were abandoned more than a day ago.
  delete from public.quiz_attempts
   where user_id = v_user and status = 'in_progress' and started_at < now() - interval '1 day';

  select coalesce(array_agg(picked.id), '{}'::uuid[])
    into v_ids
    from (
      select q.id
        from public.questions q
        join public.subtopics s on s.id = q.subtopic_id
       where q.is_published
         and (p_topic_id is null or s.topic_id = p_topic_id)
         and (p_difficulty is null or q.difficulty = p_difficulty)
       order by random()
       limit p_question_count
    ) picked;

  v_count := cardinality(v_ids);
  if v_count = 0 then
    raise exception 'no_questions_available' using errcode = 'P0002';
  end if;

  insert into public.quiz_attempts (user_id, mode, topic_id, difficulty, question_count, feedback)
  values (v_user, p_mode, p_topic_id, p_difficulty, v_count, p_feedback)
  returning id into v_attempt;

  insert into public.attempt_answers (attempt_id, question_id, position)
  select v_attempt, t.question_id, t.ordinality
    from unnest(v_ids) with ordinality as t(question_id, ordinality);

  return v_attempt;
end;
$$;

-- Practice mode: records and locks one answer, then reveals the key and explanation for that question.
create function public.check_quiz_answer(p_attempt_id uuid, p_question_id uuid, p_option_ids uuid[])
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user       uuid := auth.uid();
  v_attempt    public.quiz_attempts%rowtype;
  v_row        public.attempt_answers%rowtype;
  v_selected   uuid[];
  v_is_correct boolean;
begin
  if v_user is null then
    raise exception 'not_authenticated' using errcode = '28000';
  end if;

  select * into v_attempt
    from public.quiz_attempts
   where id = p_attempt_id and user_id = v_user
   for update;
  if not found then
    raise exception 'attempt_not_found' using errcode = 'P0002';
  end if;
  if v_attempt.status <> 'in_progress' then
    raise exception 'attempt_already_completed' using errcode = '55000';
  end if;
  if v_attempt.feedback <> 'instant' then
    raise exception 'instant_feedback_disabled' using errcode = '42501';
  end if;

  select * into v_row
    from public.attempt_answers
   where attempt_id = p_attempt_id and question_id = p_question_id
   for update;
  if not found then
    raise exception 'question_not_in_attempt' using errcode = 'P0002';
  end if;
  if v_row.answered_at is not null then
    raise exception 'question_already_answered' using errcode = '55000';
  end if;

  v_selected := public._validated_selection(p_question_id, p_option_ids);
  if cardinality(v_selected) = 0 then
    raise exception 'no_option_selected' using errcode = '22023';
  end if;

  v_is_correct := v_selected = public._correct_option_ids(p_question_id);

  update public.attempt_answers
     set selected_option_ids = v_selected, is_correct = v_is_correct, answered_at = now()
   where id = v_row.id;

  return public._question_review(p_question_id, v_row.position, v_selected, v_is_correct);
end;
$$;

-- Scores an attempt. Answers already locked by check_quiz_answer are kept; the rest come from p_answers:
-- [{"question_id": "...", "option_ids": ["...", "..."]}]. A question scores only if the selection matches
-- the answer key exactly (no partial credit). Skipped questions score as incorrect.
-- Submitting twice is safe: a completed attempt returns its stored result unchanged.
create function public.submit_quiz_attempt(p_attempt_id uuid, p_answers jsonb default '[]'::jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user          uuid := auth.uid();
  v_attempt       public.quiz_attempts%rowtype;
  v_row           public.attempt_answers%rowtype;
  v_item          jsonb;
  v_selected      uuid[];
  v_is_correct    boolean;
  v_correct_count integer;
begin
  if v_user is null then
    raise exception 'not_authenticated' using errcode = '28000';
  end if;
  if p_answers is null or jsonb_typeof(p_answers) <> 'array' or jsonb_array_length(p_answers) > 200 then
    raise exception 'invalid_answers' using errcode = '22023';
  end if;

  select * into v_attempt
    from public.quiz_attempts
   where id = p_attempt_id and user_id = v_user
   for update;
  if not found then
    raise exception 'attempt_not_found' using errcode = 'P0002';
  end if;
  if v_attempt.status = 'completed' then
    return public.get_attempt_result(p_attempt_id);
  end if;

  for v_row in
    select * from public.attempt_answers where attempt_id = p_attempt_id order by position for update
  loop
    if v_row.answered_at is null then
      v_item := null;
      select e into v_item
        from jsonb_array_elements(p_answers) as e
       where e ->> 'question_id' = v_row.question_id::text
       limit 1;

      if v_item is not null then
        if jsonb_typeof(v_item -> 'option_ids') is distinct from 'array' then
          raise exception 'invalid_answers' using errcode = '22023';
        end if;
        begin
          v_selected := public._validated_selection(
            v_row.question_id,
            array(select (x)::uuid from jsonb_array_elements_text(v_item -> 'option_ids') as x));
        exception when invalid_text_representation then
          raise exception 'invalid_answers' using errcode = '22023';
        end;
      else
        v_selected := '{}'::uuid[];
      end if;

      v_is_correct := cardinality(v_selected) > 0
                      and v_selected = public._correct_option_ids(v_row.question_id);

      update public.attempt_answers
         set selected_option_ids = v_selected,
             is_correct = v_is_correct,
             answered_at = case when cardinality(v_selected) > 0 then now() else null end
       where id = v_row.id;
    end if;
  end loop;

  select count(*) filter (where is_correct) into v_correct_count
    from public.attempt_answers where attempt_id = p_attempt_id;

  update public.quiz_attempts
     set status = 'completed', completed_at = now(), correct_count = v_correct_count
   where id = p_attempt_id;

  insert into public.activity_log (user_id, kind, ref_id, meta)
  values (v_user, 'quiz_completed', p_attempt_id,
          jsonb_build_object('correct', v_correct_count, 'total', v_attempt.question_count,
                             'mode', v_attempt.mode, 'topic_id', v_attempt.topic_id));

  return public.get_attempt_result(p_attempt_id);
end;
$$;

-- Full review of a completed attempt (answer keys, notes, explanations).
create function public.get_attempt_result(p_attempt_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user    uuid := auth.uid();
  v_attempt public.quiz_attempts%rowtype;
  v_answers jsonb;
begin
  if v_user is null then
    raise exception 'not_authenticated' using errcode = '28000';
  end if;
  select * into v_attempt from public.quiz_attempts where id = p_attempt_id and user_id = v_user;
  if not found then
    raise exception 'attempt_not_found' using errcode = 'P0002';
  end if;
  if v_attempt.status <> 'completed' then
    raise exception 'attempt_not_completed' using errcode = '55000';
  end if;

  select coalesce(jsonb_agg(
           public._question_review(aa.question_id, aa.position, aa.selected_option_ids, aa.is_correct)
           order by aa.position), '[]'::jsonb)
    into v_answers
    from public.attempt_answers aa
   where aa.attempt_id = p_attempt_id;

  return jsonb_build_object(
    'attempt', jsonb_build_object(
      'id', v_attempt.id, 'mode', v_attempt.mode, 'topic_id', v_attempt.topic_id,
      'difficulty', v_attempt.difficulty, 'feedback', v_attempt.feedback,
      'question_count', v_attempt.question_count, 'correct_count', v_attempt.correct_count,
      'started_at', v_attempt.started_at, 'completed_at', v_attempt.completed_at),
    'answers', v_answers);
end;
$$;

-- Lets a refreshed browser rebuild a practice-mode attempt. Exam-style attempts reveal nothing here.
create function public.get_attempt_progress(p_attempt_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_user     uuid := auth.uid();
  v_attempt  public.quiz_attempts%rowtype;
  v_answered jsonb := '[]'::jsonb;
begin
  if v_user is null then
    raise exception 'not_authenticated' using errcode = '28000';
  end if;
  select * into v_attempt from public.quiz_attempts where id = p_attempt_id and user_id = v_user;
  if not found then
    raise exception 'attempt_not_found' using errcode = 'P0002';
  end if;

  if v_attempt.feedback = 'instant' then
    select coalesce(jsonb_agg(
             public._question_review(aa.question_id, aa.position, aa.selected_option_ids, aa.is_correct)
             order by aa.position), '[]'::jsonb)
      into v_answered
      from public.attempt_answers aa
     where aa.attempt_id = p_attempt_id and aa.answered_at is not null;
  end if;

  return jsonb_build_object('status', v_attempt.status, 'feedback', v_attempt.feedback, 'answered', v_answered);
end;
$$;

-- ── Execution rights ─────────────────────────────────────────────────────
revoke all on function public._correct_option_ids(uuid) from public, anon, authenticated;
revoke all on function public._validated_selection(uuid, uuid[]) from public, anon, authenticated;
revoke all on function public._question_review(uuid, integer, uuid[], boolean) from public, anon, authenticated;

revoke all on function public.start_quiz_attempt(text, uuid, text, integer, text) from public, anon;
revoke all on function public.check_quiz_answer(uuid, uuid, uuid[]) from public, anon;
revoke all on function public.submit_quiz_attempt(uuid, jsonb) from public, anon;
revoke all on function public.get_attempt_result(uuid) from public, anon;
revoke all on function public.get_attempt_progress(uuid) from public, anon;

grant execute on function public.start_quiz_attempt(text, uuid, text, integer, text) to authenticated;
grant execute on function public.check_quiz_answer(uuid, uuid, uuid[]) to authenticated;
grant execute on function public.submit_quiz_attempt(uuid, jsonb) to authenticated;
grant execute on function public.get_attempt_result(uuid) to authenticated;
grant execute on function public.get_attempt_progress(uuid) to authenticated;

commit;
