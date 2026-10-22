import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { buildSeedSql, validateContent, type ContentFile } from './content';

const root = fileURLToPath(new URL('..', import.meta.url));
const contentPath = `${root}content/questions.json`;
const seedPath = `${root}supabase/seed/0001_questions.sql`;
const checkOnly = process.argv.includes('--check');

const data = JSON.parse(readFileSync(contentPath, 'utf8')) as ContentFile;
const problems = validateContent(data);
if (problems.length > 0) {
  console.error(`Content has ${problems.length} problem(s):`);
  for (const p of problems) console.error(`  - ${p}`);
  process.exit(1);
}

const expected = buildSeedSql(data);
if (checkOnly) {
  const current = existsSync(seedPath) ? readFileSync(seedPath, 'utf8') : '';
  if (current !== expected) {
    console.error('supabase/seed/0001_questions.sql is out of date. Run: npm run content:build');
    process.exit(1);
  }
  console.log(`Content OK: ${data.questions.length} questions, seed file up to date.`);
} else {
  mkdirSync(`${root}supabase/seed`, { recursive: true });
  writeFileSync(seedPath, expected);
  console.log(`Content OK. Wrote ${data.questions.length} questions to supabase/seed/0001_questions.sql`);
}
