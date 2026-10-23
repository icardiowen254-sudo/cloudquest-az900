import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { buildFlashcardSql, validateFlashcards, type FlashcardFile } from './flashcards';
import { buildSeedSql, validateContent, type ContentFile } from './content';

const root = fileURLToPath(new URL('..', import.meta.url));
const checkOnly = process.argv.includes('--check');
const questionsPath = `${root}content/questions.json`;
const flashcardsPath = `${root}content/flashcards.json`;
const questionSeed = `${root}supabase/seed/0001_questions.sql`;
const flashcardSeed = `${root}supabase/seed/0002_flashcards.sql`;

const questions = JSON.parse(readFileSync(questionsPath, 'utf8')) as ContentFile;
const flashcards = JSON.parse(readFileSync(flashcardsPath, 'utf8')) as FlashcardFile;

const problems = [...validateContent(questions), ...validateFlashcards(flashcards, questions)];
if (problems.length > 0) {
  console.error(`Content has ${problems.length} problem(s):`);
  for (const p of problems) console.error(`  - ${p}`);
  process.exit(1);
}

const outputs: [string, string][] = [
  [questionSeed, buildSeedSql(questions)],
  [flashcardSeed, buildFlashcardSql(flashcards, questions)],
];

if (checkOnly) {
  const stale = outputs.filter(([path, text]) => !existsSync(path) || readFileSync(path, 'utf8') !== text);
  if (stale.length > 0) {
    console.error(`Out of date: ${stale.map(([p]) => p.replace(root, '')).join(', ')}. Run: npm run content:build`);
    process.exit(1);
  }
  console.log(`Content OK: ${questions.questions.length} questions, ${flashcards.cards.length} flashcards, seed files up to date.`);
} else {
  mkdirSync(`${root}supabase/seed`, { recursive: true });
  for (const [path, text] of outputs) writeFileSync(path, text);
  console.log(`Content OK. Wrote ${questions.questions.length} questions and ${flashcards.cards.length} flashcards.`);
}
