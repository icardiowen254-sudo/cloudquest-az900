-- Stage 3 database checks on a scratch Postgres 15+ (never touches Supabase).
--   createdb cq_stage3
--   psql -v ON_ERROR_STOP=1 -d cq_stage3 -f supabase/tests/stage3_check.sql

create schema auth;
create table auth.users (id uuid primary key, email text, raw_user_meta_data jsonb not null default '{}'::jsonb);
create function auth.uid() returns uuid language sql stable as $$
  select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid
$$;
do $$ begin create role anon nologin; exception when duplicate_object then null; end $$;
do $$ begin create role authenticated nologin; exception when duplicate_object then null; end $$;
do $$ begin create role service_role nologin bypassrls; exception when duplicate_object then null; end $$;
grant usage on schema public, auth to anon, authenticated, service_role;
alter default privileges in schema public grant all on tables to anon, authenticated, service_role;

\ir ../setup_all.sql

insert into auth.users (id, email) values
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'a@example.test'),
  ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 'b@example.test');

do $$
begin
  assert (select count(*) from public.flashcards where is_published) >= 30, 'flashcards are seeded';
  assert not exists (select 1 from public.flashcards f
                      where not exists (select 1 from public.subtopics s where s.id = f.subtopic_id)),
    'every flashcard belongs to a subtopic';
  assert not exists (select 1 from pg_tables where schemaname = 'public' and not rowsecurity),
    'every public table has row level security';
end $$;

-- ── Learner A: flashcard scheduling ──────────────────────────────────────
begin;
set local role authenticated;
select set_config('request.jwt.claim.sub', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', true);
do $$
declare
  v_card  uuid;
  v_r     jsonb;
  v_queue integer;
begin
  select count(*) into v_queue from public.get_review_queue(100);
  assert v_queue = (select count(*) from public.flashcards where is_published), 'a new learner gets every card as new';
  assert (select bool_and(is_new) from public.get_review_queue(100)), 'all cards are new before any review';

  select id into v_card from public.flashcards where is_published order by id limit 1;

  v_r := public.review_flashcard(v_card, 2);   -- Good, first review: 1 day
  assert (v_r ->> 'interval_days')::integer = 1, 'first Good review schedules one day';
  assert (v_r ->> 'repetitions')::integer = 1, 'repetitions count reviews';

  v_r := public.review_flashcard(v_card, 2);   -- Good, second review: 3 days
  assert (v_r ->> 'interval_days')::integer = 3, 'second Good review schedules three days';

  v_r := public.review_flashcard(v_card, 3);   -- Easy, third review: ease rises, interval grows
  assert (v_r ->> 'interval_days')::integer > 3, 'later Easy reviews grow the interval';

  v_r := public.review_flashcard(v_card, 0);   -- Again: back in 10 minutes, reps reset
  assert (v_r ->> 'interval_days')::integer = 0, 'Again resets the interval';
  assert (v_r ->> 'repetitions')::integer = 0, 'Again resets repetitions';
  assert (select lapses from public.flashcard_states where flashcard_id = v_card) = 1, 'lapses are recorded';
  assert (select due_at between now() and now() + interval '15 minutes' from public.flashcard_states where flashcard_id = v_card),
    'a card answered Again returns within 15 minutes';
  assert (select count(*) from public.get_review_queue(100) where flashcard_id = v_card) = 0,
    'and is not yet due in the queue';
end $$;
commit;

-- Review history and rejected input
begin;
set local role authenticated;
select set_config('request.jwt.claim.sub', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', true);
do $$
declare
  v_card uuid;
  v_hist integer;
  blocked boolean;
begin
  select id into v_card from public.flashcards where is_published order by id offset 1 limit 1;
  perform public.review_flashcard(v_card, 1);
  select count(*) into v_hist from public.flashcard_reviews where flashcard_id = v_card;
  assert v_hist = 1, 'every review is recorded in history';

  blocked := false;
  begin perform public.review_flashcard(v_card, 9); exception when others then blocked := true; end;
  assert blocked, 'ratings outside 0 to 3 are rejected';

  blocked := false;
  begin perform public.review_flashcard('00000000-0000-0000-0000-000000000000', 2);
  exception when others then blocked := true; end;
  assert blocked, 'unknown flashcards are rejected';

  blocked := false;
  begin
    update public.flashcard_states set interval_days = 999 where flashcard_id = v_card;
  exception when insufficient_privilege then blocked := true; end;
  assert blocked, 'learners cannot edit schedules directly';
end $$;
commit;

-- ── Learner A: study plans ───────────────────────────────────────────────
begin;
set local role authenticated;
select set_config('request.jwt.claim.sub', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', true);
do $$
declare
  v_plan1 uuid;
  v_plan2 uuid;
  v_topic uuid;
  blocked boolean;
begin
  select id into v_topic from public.topics where slug = 'cloud-concepts';
  v_plan1 := public.save_study_plan(current_date + 30, 5, '{1,3,5}',
    jsonb_build_array(jsonb_build_object('scheduled_for', current_date + 1, 'kind', 'learn',
                      'topic_id', v_topic, 'title', 'Learn: Cloud concepts', 'planned_minutes', 45)));
  assert (select count(*) from public.study_sessions where plan_id = v_plan1) = 1, 'plan sessions are saved';

  v_plan2 := public.save_study_plan(current_date + 30, 6, '{2,4}',
    jsonb_build_array(jsonb_build_object('scheduled_for', current_date + 2, 'kind', 'quiz',
                      'topic_id', null, 'title', 'Mixed quiz', 'planned_minutes', 30)));
  assert (select status from public.study_plans where id = v_plan1) = 'archived', 'regenerating archives the old plan';
  assert (select count(*) from public.study_plans where status = 'active') = 1, 'only one active plan';

  blocked := false;
  begin perform public.save_study_plan(current_date - 1, 5, '{1}', '[]'::jsonb);
  exception when others then blocked := true; end;
  assert blocked, 'a past exam date is rejected';

  blocked := false;
  begin perform public.save_study_plan(current_date + 10, 5, '{1}',
    jsonb_build_array(jsonb_build_object('scheduled_for', current_date + 99, 'kind', 'learn',
                      'title', 'Too late', 'planned_minutes', 30)));
  exception when others then blocked := true; end;
  assert blocked, 'sessions after the exam date are rejected';

  blocked := false;
  begin perform public.save_study_plan(current_date + 10, 0, '{1}', '[]'::jsonb);
  exception when others then blocked := true; end;
  assert blocked, 'zero weekly hours are rejected';

  -- Completing and rescheduling a session is allowed for the owner
  update public.study_sessions set status = 'completed', completed_at = now() where plan_id = v_plan2;
  assert (select status from public.study_sessions where plan_id = v_plan2) = 'completed', 'learner can complete a session';
  update public.study_sessions set rescheduled_from = scheduled_for, scheduled_for = current_date + 3 where plan_id = v_plan2;
  assert (select scheduled_for from public.study_sessions where plan_id = v_plan2) = current_date + 3, 'learner can reschedule';
end $$;
commit;

-- ── Learner B: isolation ─────────────────────────────────────────────────
begin;
set local role authenticated;
select set_config('request.jwt.claim.sub', 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', true);
do $$
declare
  v_card uuid;
  blocked boolean;
begin
  assert (select count(*) from public.study_plans) = 0, 'B cannot see A plans';
  assert (select count(*) from public.study_sessions) = 0, 'B cannot see A sessions';
  assert (select count(*) from public.flashcard_states) = 0, 'B cannot see A flashcard progress';
  assert (select count(*) from public.ai_usage) = 0, 'B cannot see A usage';
  assert (select count(*) from public.get_review_queue(100)) = (select count(*) from public.flashcards where is_published),
    'B sees all cards as new (progress is not shared)';

  -- B can save their own plan; it does not touch A's active plan
  perform public.save_study_plan(current_date + 5, 5, '{1}',
    jsonb_build_array(jsonb_build_object('scheduled_for', current_date + 1, 'kind', 'learn', 'title', 'B session', 'planned_minutes', 30)));
  assert (select count(*) from public.study_plans) = 1, 'B sees only their own plan after saving';
end $$;
commit;

-- A's plan is still active and untouched after B's activity
begin;
set local role authenticated;
select set_config('request.jwt.claim.sub', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', true);
do $$
begin
  assert (select count(*) from public.study_plans where status = 'active') = 1, 'A keeps exactly one active plan';
  assert (select count(*) from public.study_sessions) >= 1, 'A still sees their sessions';
  assert (select count(*) from public.study_sessions where title = 'B session') = 0, 'A never sees B sessions';
end $$;
commit;

-- ── The tutor's daily limit is enforced on the server and cannot be called by learners ──
do $$
begin
  assert public.consume_ai_message('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 2) = true, 'first tutor message allowed';
  assert public.consume_ai_message('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 2) = true, 'second tutor message allowed';
  assert public.consume_ai_message('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 2) = false, 'third message blocked at the limit';
  assert (select messages from public.ai_usage where user_id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa') = 2, 'usage stops at the limit';
end $$;

begin;
set local role authenticated;
select set_config('request.jwt.claim.sub', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', true);
do $$
declare blocked boolean := false;
begin
  begin perform public.consume_ai_message('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 999);
  exception when insufficient_privilege then blocked := true; end;
  assert blocked, 'learners cannot consume tutor messages directly';
end $$;
commit;

\echo 'STAGE 3 CHECKS PASSED'
