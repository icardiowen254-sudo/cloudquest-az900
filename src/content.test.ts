import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import data from '../content/questions.json';
import { SUBTOPIC_SLUGS, buildSeedSql, uuidV5, validateContent, type ContentFile } from '../scripts/content';

const content = data as unknown as ContentFile;
const clone = (): ContentFile => JSON.parse(JSON.stringify(content)) as ContentFile;

describe('question bank', () => {
  it('passes every authoring check', () => {
    expect(validateContent(content)).toEqual([]);
  });

  it('has at least 40 questions and covers every subtopic', () => {
    expect(content.questions.length).toBeGreaterThanOrEqual(40);
    for (const slug of SUBTOPIC_SLUGS) {
      expect(content.questions.filter((q) => q.subtopic === slug).length).toBeGreaterThanOrEqual(3);
    }
  });

  it('keeps the committed seed file in sync with the content', () => {
    const committed = readFileSync(new URL('../supabase/seed/0001_questions.sql', import.meta.url), 'utf8');
    expect(committed).toBe(buildSeedSql(content));
  });
});

describe('validator', () => {
  it('rejects a single-answer question with no correct option', () => {
    const bad = clone();
    bad.questions[0].options.forEach((o) => (o.correct = false));
    expect(validateContent(bad).join('\n')).toContain('exactly 1 correct');
  });

  it('rejects a wrong option without a note', () => {
    const bad = clone();
    const wrong = bad.questions[0].options.find((o) => !o.correct);
    if (wrong) wrong.note = '';
    expect(validateContent(bad).join('\n')).toContain('needs an explanatory note');
  });

  it('rejects a reference that is not on an allowed host', () => {
    const bad = clone();
    const first = Object.keys(bad.references)[0];
    bad.references[first].url = 'https://example.com/azure';
    expect(validateContent(bad).join('\n')).toContain('url must be https on');
  });

  it('rejects duplicate keys and unknown subtopics', () => {
    const bad = clone();
    bad.questions[1].key = bad.questions[0].key;
    bad.questions[2].subtopic = 'not-a-subtopic';
    const text = validateContent(bad).join('\n');
    expect(text).toContain('duplicate key');
    expect(text).toContain('unknown subtopic');
  });

  it('flags a correct answer that is far longer than every wrong answer', () => {
    const bad = clone();
    const q = bad.questions[0];
    q.options.find((o) => o.correct)!.text = 'x'.repeat(200);
    expect(validateContent(bad).join('\n')).toContain('much longer');
  });
});

describe('seed generation', () => {
  it('produces stable version-5 UUIDs', () => {
    expect(uuidV5('a')).toBe(uuidV5('a'));
    expect(uuidV5('a')).not.toBe(uuidV5('b'));
    expect(uuidV5('a')).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-5[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
  });

  it('escapes single quotes in SQL strings', () => {
    expect(buildSeedSql(content)).toContain("host''s operating system");
  });

  it('writes one answer key row per option', () => {
    const optionCount = content.questions.reduce((n, q) => n + q.options.length, 0);
    const sql = buildSeedSql(content);
    const keyRows = sql.split('into public.option_solutions')[1].split('on conflict')[0].match(/\(\'[0-9a-f-]{36}\', (true|false)/g) ?? [];
    expect(keyRows.length).toBe(optionCount);
  });
});
