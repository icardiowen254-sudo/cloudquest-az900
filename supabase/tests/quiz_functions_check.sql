-- Local check of the quiz engine on a scratch Postgres 15+ (never touches Supabase).
-- Loads migrations 0001 and 0002 plus the question seed, then plays quizzes as two learners.
--
--   createdb cq_quiz
--   psql -v ON_ERROR_STOP=1 -d cq_quiz -f supabase/tests/quiz_functions_check.sql

create schema auth;
create table auth.users (id uuid primary key, email text, raw_user_meta_data jsonb not null default '{}'::jsonb);
create function auth.uid() returns uuid language sql stable as $$
  select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid
$$;
do $$
begin
  create role anon nologin;
exception when duplicate_object then null;
end $$;
do $$
begin
  create role authenticated nologin;
exception when duplicate_object then null;
end $$;
do $$
begin
  create role service_role nologin bypassrls;
exception when duplicate_object then null;
end $$;
grant usage on schema public, auth to anon, authenticated, service_role;
alter default privileges in schema public grant all on tables to anon, authenticated, service_role;

\ir ../migrations/0001_schema.sql
\ir ../migrations/0002_quiz.sql
\ir ../seed/0001_questions.sql

-- ── Test-only helpers (not part of the migrations) ───────────────────────
create table public.test_ctx (k text primary key, v text);
create table public.test_keys as
  select o.question_id,
         array_agg(os.option_id order by os.option_id) filter (where os.is_correct) as correct_ids
    from public.answer_options o
    join public.option_solutions os on os.option_id = o.id
   group by o.question_id;

create function public.test_expect_error(p_sql text, p_message text default null, p_state text default null)
returns void language plpgsql as $$
declare
  v_msg text;
  v_state text;
begin
  begin
    execute p_sql;
  exception when others then
    get stacked diagnostics v_state = returned_sqlstate, v_msg = message_text;
    if p_message is not null and v_msg is distinct from p_message then
      raise exception 'expected error "%" but got "%" for: %', p_message, v_msg, p_sql;
    end if;
    if p_state is not null and v_state is distinct from p_state then
      raise exception 'expected sqlstate % but got % for: %', p_state, v_state, p_sql;
    end if;
    return;
  end;
  raise exception 'expected an error but the statement succeeded: %', p_sql;
end;
$$;

-- ── The seeded content is internally consistent, and re-seeding is idempotent ─
do $$
begin
  assert (select count(*) from public.questions where is_published) >= 40, 'at least 40 published questions';
  assert not exists (select 1 from public.questions q
                      where not exists (select 1 from public.question_solutions s where s.question_id = q.id)),
    'every question has an explanation';
  assert not exists (select 1 from public.questions q
                      where (select count(*) from public.answer_options o where o.question_id = q.id) < 3),
    'every question has at least three options';
  assert not exists (select 1 from public.questions q join public.test_keys k on k.question_id = q.id
                      where q.kind = 'single' and cardinality(k.correct_ids) <> 1),
    'single-answer questions have exactly one correct option';
  assert not exists (select 1 from public.questions q join public.test_keys k on k.question_id = q.id
                      where q.kind = 'multiple' and cardinality(k.correct_ids) < 2),
    'multiple-answer questions have at least two correct options';
  assert not exists (select 1 from public.option_solutions os
                      where not os.is_correct and (os.note is null or length(os.note) < 10)),
    'every wrong option explains why it is wrong';
  assert (select count(distinct s.topic_id) from public.questions q join public.subtopics s on s.id = q.subtopic_id) = 3,
    'every skill area has questions';
end $$;

create table public.test_counts as select count(*) as options from public.answer_options;
\ir ../seed/0001_questions.sql
do $$
begin
  assert (select options from public.test_counts) = (select count(*) from public.answer_options),
    're-seeding does not duplicate options';
end $$;

insert into auth.users (id, email) values
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'a@example.test'),
  ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 'b@example.test');

-- An attempt A abandoned two days ago, to prove housekeeping removes it
insert into public.quiz_attempts (id, user_id, mode, question_count, started_at)
values ('d0000000-0000-0000-0000-000000000001', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'mixed', 5, now() - interval '2 days');

-- ── Learner A, quiz 1: topic quiz, exam style, partly answered ───────────
begin;
set local role authenticated;
select set_config('request.jwt.claim.sub', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', true);
do $$
declare
  v_topic    uuid;
  v_attempt  uuid;
  v_row      record;
  v_keys     uuid[];
  v_wrong    uuid;
  v_payload  jsonb := '[]'::jsonb;
  v_expected integer := 0;
  v_result   jsonb;
  v_again    jsonb;
  v_q1       uuid;
begin
  select id into v_topic from public.topics where slug = 'cloud-concepts';
  v_attempt := public.start_quiz_attempt('topic', v_topic, null, 5, 'end');
  insert into public.test_ctx values ('attempt_a', v_attempt::text);

  assert (select count(*) from public.quiz_attempts where id = 'd0000000-0000-0000-0000-000000000001') = 0,
    'abandoned attempts older than a day are removed';
  assert (select question_count from public.quiz_attempts where id = v_attempt) = 5, 'five questions drawn';
  assert (select count(distinct question_id) from public.attempt_answers where attempt_id = v_attempt) = 5,
    'questions are distinct';
  assert (select count(*) from public.attempt_answers aa
            join public.questions q on q.id = aa.question_id
            join public.subtopics s on s.id = q.subtopic_id
           where aa.attempt_id = v_attempt and s.topic_id = v_topic) = 5,
    'every question belongs to the chosen topic';

  select question_id into v_q1 from public.attempt_answers where attempt_id = v_attempt and position = 1;

  -- Exam-style attempts reveal nothing early
  perform public.test_expect_error(
    format('select public.check_quiz_answer(%L, %L, array[]::uuid[])', v_attempt, v_q1), 'instant_feedback_disabled');
  perform public.test_expect_error(format('select public.get_attempt_result(%L)', v_attempt), 'attempt_not_completed');
  assert jsonb_array_length(public.get_attempt_progress(v_attempt) -> 'answered') = 0, 'progress reveals nothing in exam mode';

  -- Position 1 fully correct, 2 wrong, 3 wrong, 4 and 5 skipped
  for v_row in
    select aa.position, aa.question_id from public.attempt_answers aa where aa.attempt_id = v_attempt order by aa.position
  loop
    select correct_ids into v_keys from public.test_keys where question_id = v_row.question_id;
    if v_row.position = 1 then
      v_payload := v_payload || jsonb_build_array(
        jsonb_build_object('question_id', v_row.question_id, 'option_ids', to_jsonb(v_keys)));
      v_expected := v_expected + 1;
    elsif v_row.position in (2, 3) then
      select o.id into v_wrong from public.answer_options o
       where o.question_id = v_row.question_id and o.id <> all (v_keys) limit 1;
      v_payload := v_payload || jsonb_build_array(
        jsonb_build_object('question_id', v_row.question_id, 'option_ids', jsonb_build_array(v_wrong)));
    end if;
  end loop;

  v_result := public.submit_quiz_attempt(v_attempt, v_payload);
  assert (v_result -> 'attempt' ->> 'correct_count')::integer = v_expected, 'score counts only fully correct answers';
  assert jsonb_array_length(v_result -> 'answers') = 5, 'result lists every question';
  assert (select count(*) from jsonb_array_elements(v_result -> 'answers') a where (a ->> 'is_correct')::boolean) = v_expected;
  assert (v_result -> 'answers' -> 0 -> 'options' -> 0 ->> 'is_correct') is not null, 'the key is revealed after submitting';
  assert (v_result -> 'answers' -> 0 ->> 'explanation') is not null, 'the explanation is revealed after submitting';
  assert (select count(*) from public.attempt_answers where attempt_id = v_attempt and is_correct is null) = 0,
    'skipped questions are scored, not left blank';
  assert (select count(*) from public.attempt_answers where attempt_id = v_attempt and answered_at is null) = 2,
    'skipped questions have no answer time';

  -- Duplicate and late submissions change nothing
  v_again := public.submit_quiz_attempt(v_attempt, '[]'::jsonb);
  assert v_again = v_result, 'a second submit returns the stored result unchanged';
  assert public.get_attempt_result(v_attempt) = v_result, 'get_attempt_result matches the submit result';
  assert (select count(*) from public.activity_log where kind = 'quiz_completed' and ref_id = v_attempt) = 1,
    'exactly one activity row per quiz';
  perform public.test_expect_error(
    format('select public.check_quiz_answer(%L, %L, array[]::uuid[])', v_attempt, v_q1), 'attempt_already_completed');

  -- The learner's performance view reflects the attempt
  assert (select sum(attempted) from public.user_subtopic_performance) = 5, 'performance counts every question';
  assert (select sum(correct) from public.user_subtopic_performance) = v_expected, 'performance counts correct answers';
end $$;
commit;

-- ── Learner A, quiz 2: every question, partial answers earn nothing ──────
begin;
set local role authenticated;
select set_config('request.jwt.claim.sub', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', true);
do $$
declare
  v_attempt uuid;
  v_row     record;
  v_keys    uuid[];
  v_payload jsonb := '[]'::jsonb;
  v_singles integer := 0;
  v_result  jsonb;
begin
  v_attempt := public.start_quiz_attempt('mixed', null, null, 60, 'end');
  assert (select question_count from public.quiz_attempts where id = v_attempt)
       = (select count(*) from public.questions where is_published),
    'a request for more questions than exist is capped at what exists';

  for v_row in
    select aa.question_id, q.kind from public.attempt_answers aa
      join public.questions q on q.id = aa.question_id where aa.attempt_id = v_attempt
  loop
    select correct_ids into v_keys from public.test_keys where question_id = v_row.question_id;
    if v_row.kind = 'single' then
      v_payload := v_payload || jsonb_build_array(
        jsonb_build_object('question_id', v_row.question_id, 'option_ids', to_jsonb(v_keys)));
      v_singles := v_singles + 1;
    else
      v_payload := v_payload || jsonb_build_array(
        jsonb_build_object('question_id', v_row.question_id, 'option_ids', jsonb_build_array(v_keys[1])));
    end if;
  end loop;

  v_result := public.submit_quiz_attempt(v_attempt, v_payload);
  assert (v_result -> 'attempt' ->> 'correct_count')::integer = v_singles, 'all single-answer questions score';
  assert (select count(*) from jsonb_array_elements(v_result -> 'answers') a
           where a ->> 'kind' = 'multiple' and (a ->> 'is_correct')::boolean) = 0,
    'selecting only some of the correct options earns no credit';
  assert (select count(*) from jsonb_array_elements(v_result -> 'answers') a where a ->> 'kind' = 'multiple') > 0,
    'the bank contains multiple-answer questions';
end $$;
commit;

-- ── Learner A, quiz 3: practice mode with instant feedback ───────────────
begin;
set local role authenticated;
select set_config('request.jwt.claim.sub', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', true);
do $$
declare
  v_attempt uuid;
  v_q       uuid[];
  v_keys    uuid[];
  v_wrong   uuid;
  v_fb      jsonb;
  v_result  jsonb;
begin
  v_attempt := public.start_quiz_attempt('mixed', null, 'easy', 3, 'instant');
  select array_agg(question_id order by position) into v_q from public.attempt_answers where attempt_id = v_attempt;
  assert cardinality(v_q) = 3, 'three easy questions drawn';

  -- Question 1: correct answer, instant feedback
  select correct_ids into v_keys from public.test_keys where question_id = v_q[1];
  v_fb := public.check_quiz_answer(v_attempt, v_q[1], v_keys);
  assert (v_fb ->> 'is_correct')::boolean, 'a correct answer is reported as correct';
  assert (v_fb ->> 'explanation') is not null and jsonb_array_length(v_fb -> 'options') >= 3, 'feedback includes explanation and options';

  -- Answers are locked once checked
  perform public.test_expect_error(
    format('select public.check_quiz_answer(%L, %L, %L::uuid[])', v_attempt, v_q[1], v_keys::text), 'question_already_answered');
  perform public.test_expect_error(
    format('select public.check_quiz_answer(%L, %L, array[]::uuid[])', v_attempt, v_q[2]), 'no_option_selected');

  -- Question 2: wrong answer still reveals the key
  select correct_ids into v_keys from public.test_keys where question_id = v_q[2];
  select o.id into v_wrong from public.answer_options o where o.question_id = v_q[2] and o.id <> all (v_keys) limit 1;
  v_fb := public.check_quiz_answer(v_attempt, v_q[2], array[v_wrong]);
  assert not (v_fb ->> 'is_correct')::boolean, 'a wrong answer is reported as wrong';
  assert (select count(*) from jsonb_array_elements(v_fb -> 'options') o where (o ->> 'is_correct')::boolean) = 1,
    'the correct option is revealed after answering';

  -- A refreshed browser can rebuild the attempt
  assert jsonb_array_length(public.get_attempt_progress(v_attempt) -> 'answered') = 2, 'progress shows answered questions';

  -- Submitting cannot rewrite locked answers, and still scores question 3 from the payload
  select correct_ids into v_keys from public.test_keys where question_id = v_q[3];
  v_result := public.submit_quiz_attempt(v_attempt, jsonb_build_array(
    jsonb_build_object('question_id', v_q[1], 'option_ids', jsonb_build_array(v_wrong)),
    jsonb_build_object('question_id', v_q[2], 'option_ids', to_jsonb(v_keys)),
    jsonb_build_object('question_id', v_q[3], 'option_ids', to_jsonb(v_keys))));
  assert (v_result -> 'attempt' ->> 'correct_count')::integer = 2, 'locked answers keep their score; the unlocked one is scored';
  assert (v_result -> 'answers' -> 0 ->> 'is_correct')::boolean, 'question 1 stays correct';
  assert not (v_result -> 'answers' -> 1 ->> 'is_correct')::boolean, 'question 2 stays wrong';
end $$;
commit;

-- ── Learner A: invalid input is rejected and does not corrupt an attempt ─
begin;
set local role authenticated;
select set_config('request.jwt.claim.sub', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', true);
do $$
declare
  v_attempt uuid;
  v_q1      uuid;
  v_foreign uuid;
  v_two     uuid[];
begin
  perform public.test_expect_error('select public.start_quiz_attempt(''x'', null, null, 5, ''end'')', 'invalid_mode');
  perform public.test_expect_error('select public.start_quiz_attempt(''topic'', null, null, 5, ''end'')', 'invalid_topic');
  perform public.test_expect_error('select public.start_quiz_attempt(''topic'', gen_random_uuid(), null, 5, ''end'')', 'invalid_topic');
  perform public.test_expect_error('select public.start_quiz_attempt(''mixed'', null, ''brutal'', 5, ''end'')', 'invalid_difficulty');
  perform public.test_expect_error('select public.start_quiz_attempt(''mixed'', null, null, 0, ''end'')', 'invalid_question_count');
  perform public.test_expect_error('select public.start_quiz_attempt(''mixed'', null, null, 61, ''end'')', 'invalid_question_count');
  perform public.test_expect_error('select public.start_quiz_attempt(''mixed'', null, null, 5, ''sometimes'')', 'invalid_feedback');

  v_attempt := public.start_quiz_attempt('mixed', null, 'easy', 3, 'end');
  select question_id into v_q1 from public.attempt_answers where attempt_id = v_attempt and position = 1;
  select o.id into v_foreign from public.answer_options o where o.question_id <> v_q1 limit 1;
  select array_agg(id) into v_two from (select id from public.answer_options where question_id = v_q1 limit 2) x;

  perform public.test_expect_error(
    format('select public.submit_quiz_attempt(%L, %L::jsonb)', v_attempt,
           jsonb_build_array(jsonb_build_object('question_id', v_q1, 'option_ids', jsonb_build_array(v_foreign)))::text),
    'invalid_option');
  perform public.test_expect_error(
    format('select public.submit_quiz_attempt(%L, %L::jsonb)', v_attempt,
           jsonb_build_array(jsonb_build_object('question_id', v_q1, 'option_ids', to_jsonb(v_two)))::text),
    'too_many_options');
  perform public.test_expect_error(format('select public.submit_quiz_attempt(%L, ''{"a":1}''::jsonb)', v_attempt), 'invalid_answers');
  perform public.test_expect_error(
    format('select public.submit_quiz_attempt(%L, %L::jsonb)', v_attempt,
           jsonb_build_array(jsonb_build_object('question_id', v_q1, 'option_ids', jsonb_build_array('not-a-uuid')))::text),
    'invalid_answers');
  perform public.test_expect_error(
    format('select public.submit_quiz_attempt(%L, %L::jsonb)', v_attempt,
           jsonb_build_array(jsonb_build_object('question_id', v_q1))::text),
    'invalid_answers');

  assert (select status from public.quiz_attempts where id = v_attempt) = 'in_progress',
    'rejected submissions leave the attempt open';
  assert (select count(*) from public.attempt_answers where attempt_id = v_attempt and answered_at is not null) = 0,
    'rejected submissions record nothing';
end $$;
commit;

-- ── Learner B cannot touch A's attempt, and has a clean slate ────────────
begin;
set local role authenticated;
select set_config('request.jwt.claim.sub', 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', true);
do $$
declare
  v_a uuid := (select v::uuid from public.test_ctx where k = 'attempt_a');
  v_q uuid := (select question_id from public.attempt_answers aa where false limit 1);
begin
  assert (select count(*) from public.quiz_attempts) = 0, 'B sees no attempts';
  assert (select count(*) from public.attempt_answers) = 0, 'B sees no answers';
  assert (select count(*) from public.user_subtopic_performance) = 0, 'B has no performance data';
  perform public.test_expect_error(format('select public.get_attempt_result(%L)', v_a), 'attempt_not_found');
  perform public.test_expect_error(format('select public.get_attempt_progress(%L)', v_a), 'attempt_not_found');
  perform public.test_expect_error(format('select public.submit_quiz_attempt(%L, ''[]''::jsonb)', v_a), 'attempt_not_found');
  perform public.test_expect_error(
    format('select public.check_quiz_answer(%L, gen_random_uuid(), array[]::uuid[])', v_a), 'attempt_not_found');
  assert public.start_quiz_attempt('mixed', null, null, 2, 'end') is not null, 'B can run their own quiz';
end $$;
commit;

-- ── No uid, anonymous visitors, and the private tables ───────────────────
begin;
set local role authenticated;
select set_config('request.jwt.claim.sub', '', true);
do $$
begin
  perform public.test_expect_error('select public.start_quiz_attempt(''mixed'', null, null, 5, ''end'')', 'not_authenticated');
end $$;
commit;

begin;
set local role anon;
do $$
begin
  perform public.test_expect_error('select public.start_quiz_attempt(''mixed'', null, null, 5, ''end'')', null, '42501');
  perform public.test_expect_error('select public.get_attempt_result(gen_random_uuid())', null, '42501');
end $$;
commit;

begin;
set local role authenticated;
select set_config('request.jwt.claim.sub', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', true);
do $$
begin
  perform public.test_expect_error('select public._question_review(gen_random_uuid(), 1, array[]::uuid[], false)', null, '42501');
  perform public.test_expect_error('select public._correct_option_ids(gen_random_uuid())', null, '42501');
  perform public.test_expect_error('select * from public.option_solutions', null, '42501');
  perform public.test_expect_error('select * from public.question_solutions', null, '42501');
  perform public.test_expect_error(
    'update public.quiz_attempts set correct_count = 99', null, '42501');
end $$;
commit;

\echo 'ALL QUIZ CHECKS PASSED'
