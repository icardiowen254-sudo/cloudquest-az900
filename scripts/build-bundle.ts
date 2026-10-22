import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { BUNDLE_SOURCES, bundleSql } from './bundle';

const root = fileURLToPath(new URL('..', import.meta.url));
const target = `${root}supabase/setup_all.sql`;

const parts = BUNDLE_SOURCES.map((name) => {
  const path = `${root}${name}`;
  if (!existsSync(path)) {
    console.error(`Missing ${name}. Run: npm run content:build`);
    process.exit(1);
  }
  return { name, sql: readFileSync(path, 'utf8') };
});
const expected = bundleSql(parts);

if (process.argv.includes('--check')) {
  const current = existsSync(target) ? readFileSync(target, 'utf8') : '';
  if (current !== expected) {
    console.error('supabase/setup_all.sql is out of date. Run: npm run db:bundle');
    process.exit(1);
  }
  console.log('supabase/setup_all.sql is up to date.');
} else {
  writeFileSync(target, expected);
  console.log(`Wrote supabase/setup_all.sql (${Math.round(expected.length / 1024)} KB, ${parts.length} parts, one transaction).`);
}
