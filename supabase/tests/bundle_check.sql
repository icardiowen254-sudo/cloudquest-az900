-- Builds the whole database from the single setup file on a scratch Postgres 15+ and smoke-tests it.
-- Never touches Supabase.
--
--   createdb cq_bundle
--   psql -v ON_ERROR_STOP=1 -d cq_bundle -f supabase/tests/bundle_check.sql

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

\ir ../setup_all.sql

do $$
begin
  assert (select count(*) from public.topics) = 3, 'three skill areas';
  assert (select count(*) from public.subtopics) = 11, 'eleven subtopics';
  assert (select count(*) from public.questions where is_published) >= 40, 'question bank is loaded';
  assert not exists (select 1 from pg_tables where schemaname = 'public' and not rowsecurity),
    'every table in the public schema has row level security enabled';
  assert (select count(*) from pg_proc p join pg_namespace n on n.oid = p.pronamespace
           where n.nspname = 'public'
             and p.proname in ('start_quiz_attempt', 'check_quiz_answer', 'submit_quiz_attempt',
                               'get_attempt_result', 'get_attempt_progress')) = 5,
    'all five quiz functions exist';
  assert (select count(distinct outline_version) from public.topics) = 1
     and (select min(outline_version) from public.topics) = 'skills-measured-2026-07-20',
    'topics carry the current outline version';
end $$;

insert into auth.users (id, email) values ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'a@example.test');

begin;
set local role authenticated;
select set_config('request.jwt.claim.sub', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', true);
do $$
declare
  v_attempt uuid;
  v_result  jsonb;
begin
  v_attempt := public.start_quiz_attempt('mixed', null, null, 5, 'end');
  v_result := public.submit_quiz_attempt(v_attempt, '[]'::jsonb);
  assert (v_result -> 'attempt' ->> 'question_count')::integer = 5, 'a quiz of five questions runs end to end';
  assert (v_result -> 'attempt' ->> 'correct_count')::integer = 0, 'an empty submission scores zero';
  assert (select count(*) from public.profiles) = 1, 'the signup trigger created the learner profile';
end $$;
commit;

\echo 'BUNDLE OK'
