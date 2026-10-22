-- Local check of the schema and row level security on a scratch Postgres 15+.
-- It never touches Supabase. It stubs what Supabase provides (auth schema, auth.uid(), roles),
-- loads migration 0001, then asserts that learners reach only their own rows and never the answer keys.
--
--   createdb cq_test
--   psql -v ON_ERROR_STOP=1 -d cq_test -f supabase/tests/rls_local_check.sql

create schema auth;
create table auth.users (
  id uuid primary key,
  email text,
  raw_user_meta_data jsonb not null default '{}'::jsonb
);
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
-- Supabase grants new public tables to these roles by default. Mirror that, so the
-- migration's own REVOKE statements are what restrict access.
alter default privileges in schema public grant all on tables to anon, authenticated, service_role;

\ir ../migrations/0001_schema.sql

-- ── Fixtures (created as the table owner) ────────────────────────────────
insert into auth.users (id, email, raw_user_meta_data) values
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'a@example.test', '{"display_name":"Ada"}'),
  ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 'b@example.test', '{"full_name":"Bayo"}');

do $$
begin
  assert (select count(*) from public.profiles) = 2, 'signup trigger creates one profile per user';
  assert (select display_name from public.profiles where id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa') = 'Ada',
    'display name comes from signup metadata';
  assert (select display_name from public.profiles where id = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb') = 'Bayo',
    'display name falls back to full_name (OAuth sign-in)';
  assert (select count(*) from public.topics) = 3, 'three skill areas seeded';
  assert (select count(*) from public.subtopics) = 11, 'eleven subtopics seeded';
end $$;

insert into public.study_plans (id, user_id, exam_date, weekly_hours, study_days)
  values ('b0000000-0000-0000-0000-000000000001', 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', '2027-01-15', 6, '{1,3,5}');
insert into public.study_sessions (plan_id, user_id, scheduled_for, kind, title, planned_minutes)
  values ('b0000000-0000-0000-0000-000000000001', 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', '2027-01-04', 'learn', 'B private session', 45);
insert into public.quiz_attempts (user_id, mode, question_count)
  values ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 'mixed', 10);
insert into public.activity_log (user_id, kind)
  values ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 'plan_generated');

insert into public.questions (id, subtopic_id, difficulty, kind, stem, learning_objective)
  select 'c0000000-0000-0000-0000-000000000001', id, 'easy', 'single', 'Test stem', 'Test objective'
  from public.subtopics where slug = 'cloud-computing';
insert into public.answer_options (id, question_id, position, body) values
  ('c0000000-0000-0000-0000-0000000000a1', 'c0000000-0000-0000-0000-000000000001', 1, 'Option 1'),
  ('c0000000-0000-0000-0000-0000000000a2', 'c0000000-0000-0000-0000-000000000001', 2, 'Option 2');
insert into public.question_solutions (question_id, explanation)
  values ('c0000000-0000-0000-0000-000000000001', 'Because.');
insert into public.option_solutions (option_id, is_correct) values
  ('c0000000-0000-0000-0000-0000000000a1', true),
  ('c0000000-0000-0000-0000-0000000000a2', false);

-- ── Learner A ────────────────────────────────────────────────────────────
begin;
set local role authenticated;
select set_config('request.jwt.claim.sub', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', true);

do $$
declare
  n integer;
  blocked boolean;
begin
  -- A sees only A's rows
  assert (select count(*) from public.profiles) = 1, 'A sees only their own profile';
  assert (select count(*) from public.study_plans) = 0, 'A cannot see B''s plan';
  assert (select count(*) from public.study_sessions) = 0, 'A cannot see B''s sessions';
  assert (select count(*) from public.quiz_attempts) = 0, 'A cannot see B''s attempts';
  assert (select count(*) from public.activity_log) = 0, 'A cannot see B''s activity';

  -- A cannot edit B's profile or create one for another id
  update public.profiles set display_name = 'hacked' where id = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';
  get diagnostics n = row_count;
  assert n = 0, 'A cannot update B''s profile';

  blocked := false;
  begin
    insert into public.profiles (id) values ('cccccccc-cccc-cccc-cccc-cccccccccccc');
  exception when insufficient_privilege then blocked := true;
  end;
  assert blocked, 'A cannot insert a profile for another id';

  -- Learning content is readable, answer keys are not
  assert (select count(*) from public.topics) = 3, 'A can read topics';
  assert (select count(*) from public.questions) = 1, 'A can read published questions';
  assert (select count(*) from public.answer_options) = 2, 'A can read answer options';

  blocked := false;
  begin
    perform 1 from public.option_solutions;
  exception when insufficient_privilege then blocked := true;
  end;
  assert blocked, 'answer keys (option_solutions) are unreadable';

  blocked := false;
  begin
    perform 1 from public.question_solutions;
  exception when insufficient_privilege then blocked := true;
  end;
  assert blocked, 'explanations (question_solutions) are unreadable before answering';

  -- Progress cannot be written from the browser
  blocked := false;
  begin
    insert into public.quiz_attempts (user_id, mode, question_count)
    values ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'mixed', 10);
  exception when insufficient_privilege then blocked := true;
  end;
  assert blocked, 'A cannot write quiz attempts directly';

  blocked := false;
  begin
    insert into public.activity_log (user_id, kind)
    values ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'quiz_completed');
  exception when insufficient_privilege then blocked := true;
  end;
  assert blocked, 'A cannot fabricate activity';

  -- Own plans work; impersonation and cross-plan sessions do not
  insert into public.study_plans (user_id, exam_date, weekly_hours, study_days)
  values ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', '2027-02-01', 5, '{2,4}');
  assert (select count(*) from public.study_plans) = 1, 'A can create and read their own plan';

  blocked := false;
  begin
    insert into public.study_plans (user_id, exam_date, weekly_hours, study_days)
    values ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', '2027-02-01', 5, '{2,4}');
  exception when insufficient_privilege then blocked := true;
  end;
  assert blocked, 'A cannot create a plan owned by B';

  blocked := false;
  begin
    insert into public.study_sessions (plan_id, user_id, scheduled_for, kind, title, planned_minutes)
    values ('b0000000-0000-0000-0000-000000000001', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
            '2027-01-05', 'learn', 'sneaky', 30);
  exception when insufficient_privilege then blocked := true;
  end;
  assert blocked, 'A cannot attach a session to B''s plan';

  -- Database constraints back up the client-side validation
  blocked := false;
  begin update public.profiles set study_days = '{}' where id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
  exception when check_violation then blocked := true; end;
  assert blocked, 'empty study_days rejected';

  blocked := false;
  begin update public.profiles set study_days = '{7}' where id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
  exception when check_violation then blocked := true; end;
  assert blocked, 'study day 7 rejected';

  blocked := false;
  begin update public.profiles set weekly_study_hours = 0 where id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
  exception when check_violation then blocked := true; end;
  assert blocked, '0 weekly hours rejected';

  blocked := false;
  begin update public.profiles set weekly_study_hours = 81 where id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
  exception when check_violation then blocked := true; end;
  assert blocked, '81 weekly hours rejected';

  update public.profiles
    set display_name = 'Ada L', exam_date = '2027-03-01', weekly_study_hours = 7.5, study_days = '{1,2,6}'
    where id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
  get diagnostics n = row_count;
  assert n = 1, 'A can update their own goals';
end $$;
rollback;

-- ── Learner B (positive control: their data is really there) ─────────────
begin;
set local role authenticated;
select set_config('request.jwt.claim.sub', 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', true);
do $$
begin
  assert (select count(*) from public.profiles) = 1, 'B sees their own profile';
  assert (select count(*) from public.study_plans) = 1, 'B sees their own plan';
  assert (select count(*) from public.study_sessions) = 1, 'B sees their own session';
  assert (select count(*) from public.quiz_attempts) = 1, 'B sees their own attempt';
  assert (select count(*) from public.activity_log) = 1, 'B sees their own activity';
end $$;
rollback;

-- ── Signed in but no uid, and anonymous visitors ─────────────────────────
begin;
set local role authenticated;
select set_config('request.jwt.claim.sub', '', true);
do $$
begin
  assert (select count(*) from public.profiles) = 0, 'no uid means no profile rows';
end $$;
rollback;

begin;
set local role anon;
do $$
declare blocked boolean := false;
begin
  begin
    perform 1 from public.topics;
  exception when insufficient_privilege then blocked := true;
  end;
  assert blocked, 'anonymous visitors cannot read topics';

  blocked := false;
  begin
    perform 1 from public.profiles;
  exception when insufficient_privilege then blocked := true;
  end;
  assert blocked, 'anonymous visitors cannot read profiles';
end $$;
rollback;

-- ── The dev reset script works and the migration can be re-applied ───────
\ir ../reset_dev.sql
\ir ../migrations/0001_schema.sql
do $$
begin
  assert (select count(*) from public.topics) = 3, 'migration re-applies after reset';
end $$;

\echo 'ALL RLS CHECKS PASSED'
