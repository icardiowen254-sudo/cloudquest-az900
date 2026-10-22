import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { BUNDLE_SOURCES, bundleSql, stripTransaction } from '../scripts/bundle';

const read = (path: string) => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');

describe('stripTransaction', () => {
  it('removes the begin and commit lines but keeps the statements', () => {
    expect(stripTransaction({ name: 'a.sql', sql: 'begin;\nselect 1;\ncommit;\n' })).toBe('select 1;');
  });

  it('does not touch plpgsql block keywords', () => {
    const sql = 'begin;\ncreate function f() returns int language plpgsql as $$\nbegin\n  return 1;\nend;\n$$;\ncommit;';
    expect(stripTransaction({ name: 'f.sql', sql })).toContain('begin\n  return 1;');
  });

  it('fails loudly when a file has no transaction wrapper', () => {
    expect(() => stripTransaction({ name: 'bad.sql', sql: 'select 1;' })).toThrow(/exactly one/);
  });
});

describe('bundleSql', () => {
  const merged = bundleSql([
    { name: 'one.sql', sql: 'begin;\ncreate table a();\ncommit;' },
    { name: 'two.sql', sql: 'begin;\ncreate table b();\ncommit;' },
  ]);

  it('wraps every part in a single transaction, in order', () => {
    expect(merged.match(/^begin;$/gm)).toHaveLength(1);
    expect(merged.match(/^commit;$/gm)).toHaveLength(1);
    expect(merged.indexOf('create table a')).toBeLessThan(merged.indexOf('create table b'));
  });

  it('labels each part so it is easy to find in the SQL editor', () => {
    expect(merged).toContain('PART 1 OF 2: one.sql');
    expect(merged).toContain('PART 2 OF 2: two.sql');
  });
});

describe('committed setup_all.sql', () => {
  const committed = read('supabase/setup_all.sql');

  it('is in sync with the migrations and the question seed', () => {
    const fresh = bundleSql(BUNDLE_SOURCES.map((name) => ({ name, sql: read(name) })));
    expect(committed).toBe(fresh);
  });

  it('is one transaction containing the schema, the quiz engine and the questions', () => {
    expect(committed.match(/^begin;$/gm)).toHaveLength(1);
    expect(committed.match(/^commit;$/gm)).toHaveLength(1);
    expect(committed).toContain('create table public.profiles');
    expect(committed).toContain('create function public.submit_quiz_attempt');
    expect(committed).toContain('insert into public.questions');
  });

  it('contains no test-only scaffolding', () => {
    expect(committed).not.toMatch(/create role|set local role|test_ctx|test_keys/i);
  });
});
