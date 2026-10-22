import { createHash } from 'node:crypto';

export type Difficulty = 'easy' | 'medium' | 'hard';
export type Kind = 'single' | 'multiple';

export interface OptionContent {
  text: string;
  correct: boolean;
  /** Why this option is right or wrong. Required for wrong options. */
  note?: string;
}

export interface QuestionContent {
  key: string;
  subtopic: string;
  difficulty: Difficulty;
  kind: Kind;
  stem: string;
  objective: string;
  explanation: string;
  reference: string;
  options: OptionContent[];
}

export interface ReferenceContent {
  title: string;
  url: string;
}

export interface ContentFile {
  outline_version: string;
  reviewed_on: string;
  verification: { method: string; checked_directly: string[]; needs_spot_check: string };
  references: Record<string, ReferenceContent>;
  questions: QuestionContent[];
}

/** Must match the subtopic slugs seeded by migration 0001. */
export const SUBTOPIC_SLUGS = [
  'cloud-computing',
  'cloud-benefits',
  'cloud-service-types',
  'core-architecture',
  'compute-networking',
  'storage',
  'identity-security',
  'cost-management',
  'governance-compliance',
  'management-deployment',
  'monitoring',
] as const;

const DIFFICULTIES: Difficulty[] = ['easy', 'medium', 'hard'];
const ALLOWED_HOSTS = ['learn.microsoft.com', 'azure.microsoft.com'];
const MIN_QUESTIONS = 40;
const MIN_PER_SUBTOPIC = 3;
const MIN_PER_DIFFICULTY = 5;

/**
 * Structural and quality checks for the question bank. Returns a list of problems; an empty list means the content is valid.
 * These checks catch authoring mistakes. They do not verify Azure facts, which still need human review against Microsoft Learn.
 */
export function validateContent(data: ContentFile): string[] {
  const problems: string[] = [];
  const add = (key: string, message: string) => problems.push(`${key}: ${message}`);

  if (!/^skills-measured-\d{4}-\d{2}-\d{2}$/.test(data.outline_version)) add('file', 'outline_version must look like skills-measured-YYYY-MM-DD');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(data.reviewed_on)) add('file', 'reviewed_on must be a YYYY-MM-DD date');
  if (!data.verification?.method || !data.verification?.needs_spot_check) add('file', 'verification notes are required');
  if (data.questions.length < MIN_QUESTIONS) add('file', `needs at least ${MIN_QUESTIONS} questions, has ${data.questions.length}`);

  for (const [refKey, ref] of Object.entries(data.references)) {
    try {
      const url = new URL(ref.url);
      if (url.protocol !== 'https:' || !ALLOWED_HOSTS.includes(url.hostname)) add(`reference ${refKey}`, `url must be https on ${ALLOWED_HOSTS.join(' or ')}`);
    } catch {
      add(`reference ${refKey}`, 'url is not valid');
    }
    if (!ref.title.trim()) add(`reference ${refKey}`, 'title is required');
  }

  const keys = new Set<string>();
  const stems = new Set<string>();
  const perSubtopic = new Map<string, number>();
  const perDifficulty = new Map<string, number>();

  for (const q of data.questions) {
    const k = q.key;
    if (!/^[a-z0-9-]+$/.test(k)) add(k, 'key must be lowercase letters, digits and hyphens');
    if (keys.has(k)) add(k, 'duplicate key');
    keys.add(k);

    if (!(SUBTOPIC_SLUGS as readonly string[]).includes(q.subtopic)) add(k, `unknown subtopic ${q.subtopic}`);
    if (!DIFFICULTIES.includes(q.difficulty)) add(k, `invalid difficulty ${q.difficulty}`);
    if (q.kind !== 'single' && q.kind !== 'multiple') add(k, `invalid kind ${q.kind}`);
    perSubtopic.set(q.subtopic, (perSubtopic.get(q.subtopic) ?? 0) + 1);
    perDifficulty.set(q.difficulty, (perDifficulty.get(q.difficulty) ?? 0) + 1);

    const stem = q.stem.trim();
    if (stem.length < 20 || stem.length > 400) add(k, 'stem must be 20 to 400 characters');
    if (!stem.endsWith('?')) add(k, 'stem should be a question ending in ?');
    if (stems.has(stem.toLowerCase())) add(k, 'duplicate stem');
    stems.add(stem.toLowerCase());

    if (!q.objective.trim()) add(k, 'learning objective is required');
    if (q.explanation.trim().length < 60) add(k, 'explanation must be at least 60 characters');
    if (!data.references[q.reference]) add(k, `unknown reference ${q.reference}`);

    if (q.options.length < 3 || q.options.length > 5) add(k, 'needs 3 to 5 options');
    const texts = new Set<string>();
    for (const o of q.options) {
      const t = o.text.trim();
      if (!t) add(k, 'option text is empty');
      if (t.length > 220) add(k, 'option text is longer than 220 characters');
      if (/all of the above|none of the above/i.test(t)) add(k, 'avoid "all of the above" and "none of the above"');
      if (texts.has(t.toLowerCase())) add(k, `duplicate option text: ${t}`);
      texts.add(t.toLowerCase());
      if (!o.correct && (o.note ?? '').trim().length < 10) add(k, `wrong option needs an explanatory note: ${t}`);
    }

    const correct = q.options.filter((o) => o.correct);
    if (q.kind === 'single' && correct.length !== 1) add(k, `single-answer question must have exactly 1 correct option, has ${correct.length}`);
    if (q.kind === 'multiple' && (correct.length < 2 || correct.length >= q.options.length)) {
      add(k, 'multiple-answer question needs at least 2 correct options and at least 1 wrong option');
    }

    // The correct answer should not stand out by length alone.
    if (q.kind === 'single' && correct.length === 1) {
      const right = correct[0].text.length;
      const longestWrong = Math.max(...q.options.filter((o) => !o.correct).map((o) => o.text.length));
      if (right >= 40 && right > longestWrong * 1.35) add(k, 'correct option is much longer than every wrong option; balance their lengths');
    }
  }

  for (const slug of SUBTOPIC_SLUGS) {
    if ((perSubtopic.get(slug) ?? 0) < MIN_PER_SUBTOPIC) add('coverage', `subtopic ${slug} needs at least ${MIN_PER_SUBTOPIC} questions`);
  }
  for (const d of DIFFICULTIES) {
    if ((perDifficulty.get(d) ?? 0) < MIN_PER_DIFFICULTY) add('coverage', `needs at least ${MIN_PER_DIFFICULTY} ${d} questions`);
  }

  // No answer position should dominate among single-answer questions.
  const positions = [0, 0, 0, 0, 0];
  let singles = 0;
  for (const q of data.questions) {
    if (q.kind !== 'single') continue;
    const index = q.options.findIndex((o) => o.correct);
    if (index >= 0) positions[index] += 1;
    singles += 1;
  }
  const dominant = Math.max(...positions);
  if (singles > 0 && dominant / singles > 0.4) add('balance', `one answer position holds ${Math.round((dominant / singles) * 100)}% of correct answers; spread them out`);

  return problems;
}

// ── Seed generation ──────────────────────────────────────────────────────

const NAMESPACE = '6f1c2a54-3c1e-4d57-9b0a-2f6d9a1b7e10';

/** Deterministic UUID (version 5), so re-running the seed updates rows instead of duplicating them. */
export function uuidV5(name: string, namespace: string = NAMESPACE): string {
  const ns = Buffer.from(namespace.replace(/-/g, ''), 'hex');
  const hash = createHash('sha1').update(ns).update(name).digest();
  hash[6] = (hash[6] & 0x0f) | 0x50;
  hash[8] = (hash[8] & 0x3f) | 0x80;
  const hex = hash.subarray(0, 16).toString('hex');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

const sql = (value: string): string => `'${value.replace(/'/g, "''")}'`;
const questionId = (key: string) => uuidV5(`question:${key}`);
const optionId = (key: string, position: number) => uuidV5(`option:${key}:${position}`);

export function buildSeedSql(data: ContentFile): string {
  const qs = data.questions;
  const qIds = qs.map((q) => questionId(q.key));
  const oIds = qs.flatMap((q) => q.options.map((_, i) => optionId(q.key, i + 1)));

  const questionRows = qs.map(
    (q) => `  (${sql(questionId(q.key))}, ${sql(q.subtopic)}, ${sql(q.difficulty)}, ${sql(q.kind)}, ${sql(q.stem)}, ${sql(q.objective)})`,
  );
  const optionRows = qs.flatMap((q) =>
    q.options.map((o, i) => `  (${sql(optionId(q.key, i + 1))}, ${sql(questionId(q.key))}, ${i + 1}, ${sql(o.text)})`),
  );
  const solutionRows = qs.map(
    (q) => `  (${sql(questionId(q.key))}, ${sql(q.explanation)}, ${sql(data.references[q.reference].url)})`,
  );
  const optionSolutionRows = qs.flatMap((q) =>
    q.options.map((o, i) => `  (${sql(optionId(q.key, i + 1))}, ${o.correct ? 'true' : 'false'}, ${o.note ? sql(o.note) : 'null'})`),
  );
  const idList = (ids: string[]) => `array[${ids.map(sql).join(', ')}]::uuid[]`;

  return `-- GENERATED by scripts/build-seed.ts from content/questions.json. Do not edit by hand.
-- Run after migrations 0001 and 0002. Safe to re-run: rows are upserted by stable ids.
-- Outline: ${data.outline_version}. Content reviewed on ${data.reviewed_on}. ${qs.length} questions.

begin;

insert into public.questions (id, subtopic_id, difficulty, kind, stem, learning_objective, is_published)
select v.id::uuid, s.id, v.difficulty, v.kind, v.stem, v.objective, true
from (values
${questionRows.join(',\n')}
) as v(id, subtopic_slug, difficulty, kind, stem, objective)
join public.subtopics s on s.slug = v.subtopic_slug
on conflict (id) do update set
  subtopic_id = excluded.subtopic_id, difficulty = excluded.difficulty, kind = excluded.kind,
  stem = excluded.stem, learning_objective = excluded.learning_objective, is_published = true;

insert into public.answer_options (id, question_id, position, body)
select v.id::uuid, v.question_id::uuid, v.position::smallint, v.body
from (values
${optionRows.join(',\n')}
) as v(id, question_id, position, body)
on conflict (id) do update set question_id = excluded.question_id, position = excluded.position, body = excluded.body;

insert into public.question_solutions (question_id, explanation, reference_url)
select v.question_id::uuid, v.explanation, v.reference_url
from (values
${solutionRows.join(',\n')}
) as v(question_id, explanation, reference_url)
on conflict (question_id) do update set explanation = excluded.explanation, reference_url = excluded.reference_url;

insert into public.option_solutions (option_id, is_correct, note)
select v.option_id::uuid, v.is_correct::boolean, v.note
from (values
${optionSolutionRows.join(',\n')}
) as v(option_id, is_correct, note)
on conflict (option_id) do update set is_correct = excluded.is_correct, note = excluded.note;

-- The repository content is the source of truth: drop options that no longer exist and unpublish removed questions.
delete from public.answer_options
 where question_id = any(${idList(qIds)})
   and id <> all(${idList(oIds)});
update public.questions set is_published = false
 where is_published and id <> all(${idList(qIds)});

do $$
begin
  if (select count(*) from public.questions where is_published) <> ${qs.length} then
    raise exception 'seed check failed: expected ${qs.length} published questions';
  end if;
end $$;

commit;
`;
}
