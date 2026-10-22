-- CloudQuest AZ-900 · migration 0001 · schema, row level security, reference data
--
-- Run once on an empty Supabase project (SQL editor, or `supabase db push`).
--
-- Rules this schema follows:
--   * Every user-owned table has RLS enabled and is scoped to auth.uid().
--   * Answer keys and explanations live in question_solutions / option_solutions.
--     Those tables have RLS enabled, NO client policies and no client grants, so a
--     browser can never read them. Scoring runs in SECURITY DEFINER functions
--     (migration 0002), which is also how attempts and flashcard schedules are written.
--   * Progress tables (attempts, flashcard state, activity) are read-only for learners,
--     so scores cannot be edited from the browser.

begin;

-- ── Shared helpers ───────────────────────────────────────────────────────
create function public.set_updated_at()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- ── Learner profiles (one row per auth user) ─────────────────────────────
create table public.profiles (
  id                  uuid primary key references auth.users (id) on delete cascade,
  display_name        text not null default '' check (char_length(display_name) <= 60),
  exam_date           date,
  weekly_study_hours  numeric(4,1) check (weekly_study_hours between 1 and 80),
  study_days          smallint[] not null default '{1,2,3,4,5}'
                        check (cardinality(study_days) between 1 and 7
                               and study_days <@ array[0,1,2,3,4,5,6]::smallint[]),
  explanation_style   text not null default 'simple' check (explanation_style in ('simple', 'detailed')),
  local_examples      boolean not null default true,
  onboarded_at        timestamptz,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);

create trigger profiles_set_updated_at
  before update on public.profiles
  for each row execute function public.set_updated_at();

create function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, display_name)
  values (
    new.id,
    left(coalesce(
      nullif(trim(new.raw_user_meta_data ->> 'display_name'), ''),
      nullif(trim(new.raw_user_meta_data ->> 'full_name'), ''),
      nullif(trim(new.raw_user_meta_data ->> 'name'), ''),
      ''), 60)
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

revoke execute on function public.handle_new_user() from public, anon, authenticated;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ── Skills outline: areas (with weights) and their subtopics ─────────────
-- Update these rows when Microsoft publishes a new skills outline.
create table public.topics (
  id              uuid primary key default gen_random_uuid(),
  slug            text not null unique,
  title           text not null,
  summary         text not null,
  weight_min      smallint not null check (weight_min between 0 and 100),
  weight_max      smallint not null check (weight_max between 0 and 100),
  sort_order      smallint not null,
  outline_version text not null,
  source_url      text not null,
  check (weight_min <= weight_max)
);

create table public.subtopics (
  id         uuid primary key default gen_random_uuid(),
  topic_id   uuid not null references public.topics (id) on delete cascade,
  slug       text not null unique,
  title      text not null,
  sort_order smallint not null
);
create index subtopics_topic_id_idx on public.subtopics (topic_id);

-- ── Question bank ────────────────────────────────────────────────────────
create table public.questions (
  id                 uuid primary key default gen_random_uuid(),
  subtopic_id        uuid not null references public.subtopics (id),
  difficulty         text not null check (difficulty in ('easy', 'medium', 'hard')),
  kind               text not null default 'single' check (kind in ('single', 'multiple')),
  stem               text not null,
  learning_objective text not null,
  is_published       boolean not null default true,
  created_at         timestamptz not null default now()
);
create index questions_subtopic_idx on public.questions (subtopic_id) where is_published;

create table public.answer_options (
  id          uuid primary key default gen_random_uuid(),
  question_id uuid not null references public.questions (id) on delete cascade,
  position    smallint not null check (position > 0),
  body        text not null,
  unique (question_id, position)
);

-- PRIVATE: answer keys and explanations (no client access, see header).
create table public.question_solutions (
  question_id   uuid primary key references public.questions (id) on delete cascade,
  explanation   text not null,
  reference_url text
);

create table public.option_solutions (
  option_id  uuid primary key references public.answer_options (id) on delete cascade,
  is_correct boolean not null,
  note       text
);

-- ── Quiz attempts ────────────────────────────────────────────────────────
create table public.quiz_attempts (
  id             uuid primary key default gen_random_uuid(),
  user_id        uuid not null references auth.users (id) on delete cascade,
  mode           text not null check (mode in ('topic', 'mixed')),
  topic_id       uuid references public.topics (id),
  difficulty     text check (difficulty in ('easy', 'medium', 'hard')),
  question_count smallint not null check (question_count between 1 and 60),
  status         text not null default 'in_progress' check (status in ('in_progress', 'completed')),
  correct_count  smallint check (correct_count >= 0),
  started_at     timestamptz not null default now(),
  completed_at   timestamptz,
  check ((status = 'completed') = (completed_at is not null))
);
create index quiz_attempts_user_idx on public.quiz_attempts (user_id, started_at desc);

create table public.attempt_answers (
  id                  uuid primary key default gen_random_uuid(),
  attempt_id          uuid not null references public.quiz_attempts (id) on delete cascade,
  question_id         uuid not null references public.questions (id),
  position            smallint not null check (position > 0),
  selected_option_ids uuid[] not null default '{}',
  is_correct          boolean,
  answered_at         timestamptz,
  unique (attempt_id, question_id),
  unique (attempt_id, position)
);
create index attempt_answers_question_idx on public.attempt_answers (question_id);

-- ── Flashcards and spaced repetition ─────────────────────────────────────
create table public.flashcards (
  id            uuid primary key default gen_random_uuid(),
  subtopic_id   uuid not null references public.subtopics (id),
  front         text not null,
  back          text not null,
  example       text,
  reference_url text,
  is_published  boolean not null default true,
  created_at    timestamptz not null default now()
);
create index flashcards_subtopic_idx on public.flashcards (subtopic_id) where is_published;

create table public.flashcard_states (
  user_id          uuid not null references auth.users (id) on delete cascade,
  flashcard_id     uuid not null references public.flashcards (id) on delete cascade,
  ease_factor      numeric(4,2) not null default 2.50 check (ease_factor >= 1.30),
  interval_days    integer not null default 0 check (interval_days >= 0),
  repetitions      integer not null default 0 check (repetitions >= 0),
  lapses           integer not null default 0 check (lapses >= 0),
  due_at           timestamptz not null default now(),
  last_reviewed_at timestamptz,
  primary key (user_id, flashcard_id)
);
create index flashcard_states_due_idx on public.flashcard_states (user_id, due_at);

create table public.flashcard_reviews (
  id              uuid primary key default gen_random_uuid(),
  user_id         uuid not null references auth.users (id) on delete cascade,
  flashcard_id    uuid not null references public.flashcards (id) on delete cascade,
  rating          smallint not null check (rating between 0 and 3), -- 0 again, 1 hard, 2 good, 3 easy
  interval_before integer not null check (interval_before >= 0),
  interval_after  integer not null check (interval_after >= 0),
  reviewed_at     timestamptz not null default now()
);
create index flashcard_reviews_user_idx on public.flashcard_reviews (user_id, reviewed_at desc);

-- ── Study plans ──────────────────────────────────────────────────────────
create table public.study_plans (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null references auth.users (id) on delete cascade,
  exam_date    date not null,
  weekly_hours numeric(4,1) not null check (weekly_hours between 1 and 80),
  study_days   smallint[] not null check (cardinality(study_days) between 1 and 7
                                          and study_days <@ array[0,1,2,3,4,5,6]::smallint[]),
  status       text not null default 'active' check (status in ('active', 'archived')),
  generated_at timestamptz not null default now()
);
create unique index study_plans_one_active_idx on public.study_plans (user_id) where status = 'active';

create table public.study_sessions (
  id               uuid primary key default gen_random_uuid(),
  plan_id          uuid not null references public.study_plans (id) on delete cascade,
  user_id          uuid not null references auth.users (id) on delete cascade,
  scheduled_for    date not null,
  kind             text not null check (kind in ('learn', 'quiz', 'flashcards', 'review', 'mock')),
  topic_id         uuid references public.topics (id),
  title            text not null check (char_length(title) between 1 and 160),
  planned_minutes  smallint not null check (planned_minutes between 5 and 480),
  status           text not null default 'pending' check (status in ('pending', 'completed', 'skipped')),
  completed_at     timestamptz,
  rescheduled_from date
);
create index study_sessions_user_day_idx on public.study_sessions (user_id, scheduled_for);
create index study_sessions_plan_idx on public.study_sessions (plan_id);

-- ── AI Study Buddy history (written by the server-side function) ─────────
create table public.ai_conversations (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references auth.users (id) on delete cascade,
  title      text not null default 'New chat' check (char_length(title) <= 120),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index ai_conversations_user_idx on public.ai_conversations (user_id, updated_at desc);

create table public.ai_messages (
  id              uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references public.ai_conversations (id) on delete cascade,
  user_id         uuid not null references auth.users (id) on delete cascade,
  role            text not null check (role in ('user', 'assistant')),
  content         text not null check (char_length(content) between 1 and 12000),
  created_at      timestamptz not null default now()
);
create index ai_messages_conversation_idx on public.ai_messages (conversation_id, created_at);

-- ── Learning activity (streaks, recent activity) ─────────────────────────
create table public.activity_log (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users (id) on delete cascade,
  kind        text not null check (kind in ('quiz_completed', 'flashcards_reviewed', 'session_completed', 'plan_generated', 'ai_chat')),
  ref_id      uuid,
  meta        jsonb not null default '{}'::jsonb,
  occurred_at timestamptz not null default now()
);
create index activity_log_user_idx on public.activity_log (user_id, occurred_at desc);

-- ── Row level security ───────────────────────────────────────────────────
alter table public.profiles           enable row level security;
alter table public.topics             enable row level security;
alter table public.subtopics          enable row level security;
alter table public.questions          enable row level security;
alter table public.answer_options     enable row level security;
alter table public.question_solutions enable row level security;  -- intentionally no policies
alter table public.option_solutions   enable row level security;  -- intentionally no policies
alter table public.quiz_attempts      enable row level security;
alter table public.attempt_answers    enable row level security;
alter table public.flashcards         enable row level security;
alter table public.flashcard_states   enable row level security;
alter table public.flashcard_reviews  enable row level security;
alter table public.study_plans        enable row level security;
alter table public.study_sessions     enable row level security;
alter table public.ai_conversations   enable row level security;
alter table public.ai_messages        enable row level security;
alter table public.activity_log       enable row level security;

-- Profiles: a learner reads and edits only their own row.
create policy profiles_select_own on public.profiles for select to authenticated
  using (id = (select auth.uid()));
create policy profiles_insert_own on public.profiles for insert to authenticated
  with check (id = (select auth.uid()));
create policy profiles_update_own on public.profiles for update to authenticated
  using (id = (select auth.uid())) with check (id = (select auth.uid()));

-- Learning content: readable by signed-in learners, writable only by the service role.
create policy topics_read on public.topics for select to authenticated using (true);
create policy subtopics_read on public.subtopics for select to authenticated using (true);
create policy questions_read on public.questions for select to authenticated using (is_published);
create policy answer_options_read on public.answer_options for select to authenticated
  using (exists (select 1 from public.questions q where q.id = question_id and q.is_published));
create policy flashcards_read on public.flashcards for select to authenticated using (is_published);

-- Progress: read-only for the owner. Writes happen in SECURITY DEFINER functions.
create policy quiz_attempts_select_own on public.quiz_attempts for select to authenticated
  using (user_id = (select auth.uid()));
create policy attempt_answers_select_own on public.attempt_answers for select to authenticated
  using (exists (select 1 from public.quiz_attempts a
                 where a.id = attempt_id and a.user_id = (select auth.uid())));
create policy flashcard_states_select_own on public.flashcard_states for select to authenticated
  using (user_id = (select auth.uid()));
create policy flashcard_reviews_select_own on public.flashcard_reviews for select to authenticated
  using (user_id = (select auth.uid()));
create policy activity_log_select_own on public.activity_log for select to authenticated
  using (user_id = (select auth.uid()));

-- Study plans and sessions belong to the learner, who may edit them freely.
create policy study_plans_select_own on public.study_plans for select to authenticated
  using (user_id = (select auth.uid()));
create policy study_plans_insert_own on public.study_plans for insert to authenticated
  with check (user_id = (select auth.uid()));
create policy study_plans_update_own on public.study_plans for update to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy study_plans_delete_own on public.study_plans for delete to authenticated
  using (user_id = (select auth.uid()));

create policy study_sessions_select_own on public.study_sessions for select to authenticated
  using (user_id = (select auth.uid()));
create policy study_sessions_insert_own on public.study_sessions for insert to authenticated
  with check (user_id = (select auth.uid())
              and exists (select 1 from public.study_plans p
                          where p.id = plan_id and p.user_id = (select auth.uid())));
create policy study_sessions_update_own on public.study_sessions for update to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy study_sessions_delete_own on public.study_sessions for delete to authenticated
  using (user_id = (select auth.uid()));

-- AI history: owner can read and delete; the Edge Function (service role) inserts.
create policy ai_conversations_select_own on public.ai_conversations for select to authenticated
  using (user_id = (select auth.uid()));
create policy ai_conversations_delete_own on public.ai_conversations for delete to authenticated
  using (user_id = (select auth.uid()));
create policy ai_messages_select_own on public.ai_messages for select to authenticated
  using (user_id = (select auth.uid()));

-- ── Grants (defence in depth on top of RLS) ──────────────────────────────
revoke all on all tables in schema public from anon;
revoke insert, update, delete, truncate on
  public.topics, public.subtopics, public.questions, public.answer_options, public.flashcards,
  public.quiz_attempts, public.attempt_answers, public.flashcard_states, public.flashcard_reviews,
  public.activity_log, public.ai_messages
  from authenticated;
revoke insert, update, truncate on public.ai_conversations from authenticated;
revoke all on public.question_solutions, public.option_solutions from authenticated;

-- ── Reference data: AZ-900 skills measured as of 20 July 2026 ─────────
-- Source: https://learn.microsoft.com/credentials/certifications/resources/study-guides/az-900
insert into public.topics (slug, title, summary, weight_min, weight_max, sort_order, outline_version, source_url)
values
  ('cloud-concepts', 'Cloud concepts',
   'What cloud computing is, why organisations adopt it, and how the service types differ.',
   25, 30, 1, 'skills-measured-2026-07-20',
   'https://learn.microsoft.com/credentials/certifications/resources/study-guides/az-900'),
  ('architecture-services', 'Azure architecture and services',
   'How Azure is organised, plus its core compute, networking, storage and identity services.',
   35, 40, 2, 'skills-measured-2026-07-20',
   'https://learn.microsoft.com/credentials/certifications/resources/study-guides/az-900'),
  ('management-governance', 'Azure management and governance',
   'Controlling costs, enforcing standards, deploying resources and monitoring them.',
   30, 35, 3, 'skills-measured-2026-07-20',
   'https://learn.microsoft.com/credentials/certifications/resources/study-guides/az-900');

insert into public.subtopics (topic_id, slug, title, sort_order)
select t.id, s.slug, s.title, s.sort_order
from (values
  ('cloud-concepts',        'cloud-computing',       'Cloud computing',                  1),
  ('cloud-concepts',        'cloud-benefits',        'Benefits of cloud services',       2),
  ('cloud-concepts',        'cloud-service-types',   'Cloud service types',              3),
  ('architecture-services', 'core-architecture',     'Core architectural components',    1),
  ('architecture-services', 'compute-networking',    'Compute and networking services',  2),
  ('architecture-services', 'storage',               'Storage services',                 3),
  ('architecture-services', 'identity-security',     'Identity, access and security',    4),
  ('management-governance', 'cost-management',       'Cost management',                  1),
  ('management-governance', 'governance-compliance', 'Governance and compliance',        2),
  ('management-governance', 'management-deployment', 'Managing and deploying resources', 3),
  ('management-governance', 'monitoring',            'Monitoring tools',                 4)
) as s(topic_slug, slug, title, sort_order)
join public.topics t on t.slug = s.topic_slug;

commit;
