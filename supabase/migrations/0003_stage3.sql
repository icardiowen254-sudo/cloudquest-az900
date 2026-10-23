-- CloudQuest AZ-900 · migration 0003 · flashcard scheduling, study plans, tutor usage limits
--
-- Learners never write to these tables directly. Each change goes through a function below,
-- so rules (rating values, valid plans, daily limits) are enforced on the server.

begin;

-- ── Flashcard review queue ───────────────────────────────────────────────
-- Due cards first, then new cards. Runs as the caller, so RLS limits it to their own progress.
create function public.get_review_queue(p_limit integer default 20)
returns table (
  flashcard_id   uuid,
  topic_title    text,
  subtopic_title text,
  front          text,
  back           text,
  example        text,
  reference_url  text,
  is_new         boolean,
  due_at         timestamptz,
  repetitions    integer
)
language sql
stable
security invoker
set search_path = ''
as $$
  select f.id,
         t.title,
         s.title,
         f.front,
         f.back,
         f.example,
         f.reference_url,
         st.flashcard_id is null,
         coalesce(st.due_at, now()),
         coalesce(st.repetitions, 0)
    from public.flashcards f
    join public.subtopics s on s.id = f.subtopic_id
    join public.topics t on t.id = s.topic_id
    left join public.flashcard_states st
           on st.flashcard_id = f.id and st.user_id = (select auth.uid())
   where f.is_published
     and (st.flashcard_id is null or st.due_at <= now())
   order by (st.flashcard_id is null), coalesce(st.due_at, now()), f.id
   limit least(greatest(p_limit, 1), 100)
$$;

-- ── Flashcard scheduling (simplified SM-2) ───────────────────────────────
-- Ratings: 0 Again, 1 Hard, 2 Good, 3 Easy.
-- Again: forgotten. Repetitions reset, the card returns in 10 minutes, ease drops by 0.20 (minimum 1.30).
-- Hard: ease drops by 0.15. Reviews 1 and 2 are fixed at 1 and 2 days; later intervals grow by 1.2x.
-- Good: reviews 1 and 2 are 1 day and 3 days; later intervals grow by the ease factor.
-- Easy: ease rises by 0.15. Reviews 1 and 2 are 4 and 6 days; later intervals grow by 1.3x the ease factor.
create function public.review_flashcard(p_flashcard_id uuid, p_rating integer)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user     uuid := auth.uid();
  v_ease     numeric(4,2);
  v_interval integer;
  v_reps     integer;
  v_lapses   integer;
  v_before   integer;
  v_due      timestamptz;
begin
  if v_user is null then
    raise exception 'not_authenticated' using errcode = '28000';
  end if;
  if p_rating is null or p_rating not in (0, 1, 2, 3) then
    raise exception 'invalid_rating' using errcode = '22023';
  end if;
  if not exists (select 1 from public.flashcards f where f.id = p_flashcard_id and f.is_published) then
    raise exception 'flashcard_not_found' using errcode = 'P0002';
  end if;

  select fs.ease_factor, fs.interval_days, fs.repetitions, fs.lapses
    into v_ease, v_interval, v_reps, v_lapses
    from public.flashcard_states fs
   where fs.user_id = v_user and fs.flashcard_id = p_flashcard_id;
  if not found then
    v_ease := 2.50; v_interval := 0; v_reps := 0; v_lapses := 0;
  end if;
  v_before := v_interval;

  if p_rating = 0 then
    v_reps := 0;
    v_lapses := v_lapses + 1;
    v_ease := greatest(1.30, v_ease - 0.20);
    v_interval := 0;
    v_due := now() + interval '10 minutes';
  else
    if p_rating = 1 then
      v_ease := greatest(1.30, v_ease - 0.15);
    elsif p_rating = 3 then
      v_ease := v_ease + 0.15;
    end if;
    v_reps := v_reps + 1;
    if v_reps = 1 then
      v_interval := case p_rating when 1 then 1 when 2 then 1 else 4 end;
    elsif v_reps = 2 then
      v_interval := case p_rating when 1 then 2 when 2 then 3 else 6 end;
    else
      v_interval := greatest(1, round(v_interval * case p_rating when 1 then 1.2 when 2 then v_ease else v_ease * 1.3 end)::integer);
    end if;
    v_due := now() + make_interval(days => v_interval);
  end if;

  insert into public.flashcard_states as fs
    (user_id, flashcard_id, ease_factor, interval_days, repetitions, lapses, due_at, last_reviewed_at)
  values (v_user, p_flashcard_id, v_ease, v_interval, v_reps, v_lapses, v_due, now())
  on conflict (user_id, flashcard_id) do update
     set ease_factor = excluded.ease_factor,
         interval_days = excluded.interval_days,
         repetitions = excluded.repetitions,
         lapses = excluded.lapses,
         due_at = excluded.due_at,
         last_reviewed_at = excluded.last_reviewed_at;

  insert into public.flashcard_reviews (user_id, flashcard_id, rating, interval_before, interval_after)
  values (v_user, p_flashcard_id, p_rating, v_before, v_interval);

  insert into public.activity_log (user_id, kind, ref_id, meta)
  values (v_user, 'flashcards_reviewed', p_flashcard_id, jsonb_build_object('rating', p_rating));

  return jsonb_build_object('flashcard_id', p_flashcard_id, 'interval_days', v_interval,
                            'repetitions', v_reps, 'due_at', v_due);
end;
$$;

-- ── Study plans ──────────────────────────────────────────────────────────
-- Stores a plan the app generated from the learner's inputs. Archives the previous active plan in the same transaction.
create function public.save_study_plan(
  p_exam_date date,
  p_weekly_hours numeric,
  p_study_days smallint[],
  p_sessions jsonb
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user uuid := auth.uid();
  v_plan uuid;
begin
  if v_user is null then
    raise exception 'not_authenticated' using errcode = '28000';
  end if;
  if p_exam_date is null or p_exam_date < current_date then
    raise exception 'exam_date_in_past' using errcode = '22023';
  end if;
  if p_weekly_hours is null or p_weekly_hours < 1 or p_weekly_hours > 80 then
    raise exception 'invalid_hours' using errcode = '22023';
  end if;
  if p_study_days is null or cardinality(p_study_days) = 0
     or not (p_study_days <@ array[0,1,2,3,4,5,6]::smallint[]) then
    raise exception 'invalid_study_days' using errcode = '22023';
  end if;
  if p_sessions is null or jsonb_typeof(p_sessions) <> 'array' or jsonb_array_length(p_sessions) > 1000 then
    raise exception 'invalid_sessions' using errcode = '22023';
  end if;
  if exists (
    select 1 from jsonb_array_elements(p_sessions) s
     where (s ->> 'scheduled_for')::date not between current_date and p_exam_date
        or (s ->> 'planned_minutes')::integer not between 5 and 480
        or s ->> 'kind' not in ('learn', 'quiz', 'flashcards', 'review', 'mock')
  ) then
    raise exception 'invalid_session' using errcode = '22023';
  end if;

  update public.study_plans set status = 'archived' where user_id = v_user and status = 'active';

  insert into public.study_plans (user_id, exam_date, weekly_hours, study_days)
  values (v_user, p_exam_date, p_weekly_hours, p_study_days)
  returning id into v_plan;

  insert into public.study_sessions (plan_id, user_id, scheduled_for, kind, topic_id, title, planned_minutes)
  select v_plan, v_user,
         (s ->> 'scheduled_for')::date,
         s ->> 'kind',
         nullif(s ->> 'topic_id', '')::uuid,
         left(s ->> 'title', 160),
         (s ->> 'planned_minutes')::smallint
    from jsonb_array_elements(p_sessions) s;

  insert into public.activity_log (user_id, kind, ref_id, meta)
  values (v_user, 'plan_generated', v_plan, jsonb_build_object('sessions', jsonb_array_length(p_sessions)));

  return v_plan;
end;
$$;

-- ── AI tutor daily limit ─────────────────────────────────────────────────
-- Only the server-side tutor function (service role) can call this. Returns false once the limit is reached.
create table public.ai_usage (
  user_id     uuid not null references auth.users (id) on delete cascade,
  usage_date  date not null default current_date,
  messages    integer not null default 0 check (messages >= 0),
  primary key (user_id, usage_date)
);
alter table public.ai_usage enable row level security;
create policy ai_usage_select_own on public.ai_usage for select to authenticated
  using (user_id = (select auth.uid()));
revoke all on public.ai_usage from anon, authenticated;
grant select on public.ai_usage to authenticated;

create function public.consume_ai_message(p_user_id uuid, p_daily_limit integer)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_ok boolean;
begin
  insert into public.ai_usage as u (user_id, usage_date, messages)
  values (p_user_id, current_date, 1)
  on conflict (user_id, usage_date) do update set messages = u.messages + 1
    where u.messages < p_daily_limit
  returning true into v_ok;
  return coalesce(v_ok, false);
end;
$$;

-- ── Execution rights ─────────────────────────────────────────────────────
revoke all on function public.get_review_queue(integer) from public, anon;
grant execute on function public.get_review_queue(integer) to authenticated;

revoke all on function public.review_flashcard(uuid, integer) from public, anon;
grant execute on function public.review_flashcard(uuid, integer) to authenticated;

revoke all on function public.save_study_plan(date, numeric, smallint[], jsonb) from public, anon;
grant execute on function public.save_study_plan(date, numeric, smallint[], jsonb) to authenticated;

revoke all on function public.consume_ai_message(uuid, integer) from public, anon, authenticated;
grant execute on function public.consume_ai_message(uuid, integer) to service_role;

commit;
