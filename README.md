# CloudQuest AZ-900 (unofficial)

An independent, unofficial study companion for the Microsoft Azure Fundamentals (AZ-900) exam, built for the
hackathon theme *Building Smarter Exam Prep Tools from Our Own Learning Journey*.

> CloudQuest AZ-900 is an independent, unofficial learning tool. It is not affiliated with or endorsed by Microsoft.
> Azure and Microsoft certification names are used for identification and educational reference.

## Status: Stage 2 of 4

| Stage | Scope | State |
| --- | --- | --- |
| 1 | Project, design system, database schema with RLS, auth, onboarding, settings | **Done** |
| 2 | Quiz engine, original question bank, server-side scoring, review screen, real dashboard stats | **Done** |
| 3 | Flashcards (spaced repetition), study planner, readiness tracker, progress history | Not started |
| 4 | AI Study Buddy (server-side function), full test pass, screenshots, deployment | Not started |

### What works

- Email and password sign-up, login, logout, password reset, protected routes, four-step onboarding, editable goals (Supabase Auth)
- Optional Google sign-in, shown only when `VITE_ENABLE_GOOGLE_AUTH=true` and the provider is enabled in Supabase
- **Quiz engine:** topic or mixed quizzes, difficulty and length choices, single- and multiple-answer questions,
  question navigator, review of every answer with an explanation for each option, retake with the same settings
- **Two feedback modes:** after each question (practice) or at the end (exam style)
- **Scoring happens in the database.** The browser never receives an answer key before it is allowed to see it
- **Dashboard from saved data:** questions answered, accuracy by skill area, weak subtopics, recent quizzes and a
  recommended next step. Areas with too few answers say "Not enough practice data yet" instead of guessing

### Not built yet

Flashcards, study planner, readiness tracker, AI Study Buddy and deployment. Their tables already exist; their screens
do not, so the sidebar lists only pages that work.

### Verified so far

- `npm run build` (type-check and production build), `npm test` (49 unit and render tests) and `npm run content:check` pass
- `supabase/tests/bundle_check.sql` builds the whole database from `setup_all.sql` on an empty PostgreSQL 16 and
  smoke-tests it. With a failure injected before the final commit, nothing was applied
- `supabase/tests/rls_local_check.sql` and `supabase/tests/quiz_functions_check.sql` pass on PostgreSQL 16 with stubbed
  Supabase auth. They cover scoring, no partial credit, locked answers, safe double submit, input validation, and that
  one learner cannot read or submit another's quiz or reach answer keys
- **Not yet verified:** a run against a live Supabase project, a real browser, email delivery and Google sign-in

## Setup

1. Create a project at [supabase.com](https://supabase.com).
2. In the SQL editor, paste and run **`supabase/setup_all.sql`** once. It is the schema, the quiz engine and the
   question bank merged into one script that runs as a single transaction, so a failure leaves nothing half-applied
   and you can simply run it again after fixing the cause. The separate files it is built from stay in the repo as the
   source: `supabase/migrations/0001_schema.sql`, `supabase/migrations/0002_quiz.sql` and `supabase/seed/0001_questions.sql`.
3. In Authentication settings, add `http://localhost:5173/**` to the redirect URLs and set the minimum password
   length to 8. For quick local testing you may turn off email confirmation; keep it on in production.
4. Copy `.env.example` to `.env.local` and paste the project URL and anon key (Project Settings, API).
5. Install and run:

```bash
npm install
npm run dev      # http://localhost:5173
```

Other commands: `npm run build`, `npm run preview`, `npm run typecheck`, `npm test`,
`npm run content:check` (validate the question bank and confirm the seed and merged setup file are current),
`npm run content:build` (regenerate the seed and the merged file after editing questions),
`npm run db:bundle` (regenerate the merged file after editing a migration).

**Reset (development only):** run `supabase/reset_dev.sql`, then repeat step 2.

## How scoring stays honest

The answer keys live in `question_solutions` and `option_solutions`. Browsers have no access to those tables.
Instead they call five functions (migration `0002`) that run with the database's own privileges:

| Function | What it does |
| --- | --- |
| `start_quiz_attempt` | Validates the settings, draws a random question set, records the attempt |
| `check_quiz_answer` | Practice mode only. Locks one answer, then reveals the key and explanation for that question |
| `submit_quiz_attempt` | Scores the attempt, writes the result and activity record in one transaction. Safe to call twice |
| `get_attempt_result` | Full review, available only after an attempt is completed |
| `get_attempt_progress` | Lets a refreshed browser resume a practice quiz. Reveals nothing in exam mode |

Rules enforced in the database: a question scores only when the selection matches the key exactly (no partial credit),
skipped questions score as incorrect, answers locked by `check_quiz_answer` cannot be rewritten at submit time, and
functions check that the attempt belongs to the signed-in learner. Dashboard figures come from the
`user_subtopic_performance` view, which obeys the caller's row level security.

## Question bank and content accuracy

`content/questions.json` holds **52 original questions** across all 11 AZ-900 subtopics, with an explanation for the
answer, a note on why each wrong option is wrong, a learning objective and a Microsoft Learn link. Nothing is copied
from the real exam.

- **Structure is checked automatically.** `scripts/content.ts` rejects questions with no single correct answer, missing
  distractor notes, unknown subtopics, links outside learn.microsoft.com or azure.microsoft.com, a correct answer that
  is far longer than the wrong ones, or answers bunched in one position. `npm test` runs these checks.
- **Facts were checked against Microsoft sources on 20 October 2026:** the study guide outline and weights
  (skills measured as of 20 July 2026), availability zones, region pairs and nonpaired regions, bandwidth pricing, and
  the existence of every linked learning module.
- **Everything else needs a human spot-check.** The remaining answers rest on long-standing Azure fundamentals
  documentation. Review them against the linked pages before publishing changes, and review the whole bank whenever
  Microsoft publishes a new skills outline.

To change a question: edit `content/questions.json`, run `npm run content:build`, then run the regenerated
`supabase/seed/0001_questions.sql` in Supabase (not the merged file, which is for an empty project). Seeding is
idempotent and unpublishes questions removed from the file.

## Project layout

```
content/        questions.json: the question bank and its verification notes
scripts/        content.ts (validator, seed generator), build-seed.ts, bundle.ts and build-bundle.ts (merged SQL)
src/
  auth/         AuthProvider (session + profile) and route guards
  components/   Design system (ui.tsx), app shell, auth layout, goal fields, OptionList
  lib/          Supabase client, goals, quiz logic (pure, tested), quiz API, friendly errors
  pages/        Welcome, Login, Register, ForgotPassword, ResetPassword, Onboarding, Dashboard,
                QuizHome, QuizRun, QuizResults, Settings
supabase/
  setup_all.sql ONE file: everything below merged, run once on an empty project (generated)
  migrations/   0001 schema + RLS + skill areas, 0002 quiz functions and performance view
  seed/         0001_questions.sql (generated from content/questions.json)
  tests/        rls_local_check.sql, quiz_functions_check.sql, bundle_check.sql (scratch Postgres, no Supabase needed)
  reset_dev.sql
```

## Data model and security

- `profiles`, `topics` and `subtopics` (the skills outline with weights), `questions`, `answer_options`,
  `question_solutions`, `option_solutions`, `quiz_attempts`, `attempt_answers`, `flashcards`, `flashcard_states`,
  `flashcard_reviews`, `study_plans`, `study_sessions`, `ai_conversations`, `ai_messages`, `activity_log`.
- Every user-owned table has RLS scoped to `auth.uid()`. Anonymous visitors can read nothing.
- Progress is read-only from the browser. Attempts and activity are written only by the functions above, so scores
  cannot be edited from the console. Study plans and sessions are the learner's own to edit.
- The anon key in the browser is public by design. Never put a service-role key or an AI provider key in `VITE_*` variables.

## Skills outline

Topics and weights come from the public [Microsoft Learn AZ-900 study guide](https://learn.microsoft.com/credentials/certifications/resources/study-guides/az-900),
skills measured as of 20 July 2026: Cloud concepts (25–30%), Azure architecture and services (35–40%),
Azure management and governance (30–35%). They live in the `topics` table with an `outline_version`, so an update is a
data change, not a code change. Check the study guide before relying on these numbers.

## Design system

Authentication and onboarding follow the login reference (warm background, white card, pill inputs, forest and lime
greens). The signed-in app follows the dashboard reference (sidebar with a profile block, active item that merges into
the content area, rounded white cards, gold accent), with the greens carried across. Tokens are in `tailwind.config.js`:

| Token | Value | Use |
| --- | --- | --- |
| forest | `#163300` | Primary buttons, headings, sidebar |
| lime | `#9fe870` | Highlights, progress, active states on dark |
| gold | `#d4a61f` | Stat tile, chart accent, "needs practice" |
| sand / canvas / mist | `#e4e4df` / `#e8efe9` / `#eef0e8` | Auth background, app background, neutral pills |

Colours were matched by eye from the screenshots. Text on gold uses forest rather than white to keep contrast readable.
Typeface: Figtree (self-hosted through Fontsource).
