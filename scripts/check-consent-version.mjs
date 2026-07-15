#!/usr/bin/env node
/**
 * Offline-проверка единой версии политики между frontend и двумя SQL-копиями.
 */
import { readFileSync, readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const migrationNames = readdirSync(join(root, 'supabase', 'migrations'))
  .filter((name) => name.endsWith('_t_consent_01_user_consents.sql'));

if (migrationNames.length !== 1) {
  console.error(`✗ Ожидалась одна T-CONSENT migration, найдено: ${migrationNames.length}`);
  process.exit(1);
}

const files = [
  'js/consent.js',
  `supabase/migrations/${migrationNames[0]}`,
  'supabase/schema.sql'
];
const versionPattern = /privacy-\d{4}-\d{2}-\d{2}-v\d+/g;
const versions = new Map();

for (const file of files) {
  const matches = readFileSync(join(root, file), 'utf8').match(versionPattern) || [];
  const unique = [...new Set(matches)];
  if (unique.length !== 1) {
    console.error(`✗ ${file}: ожидалась одна версия политики, найдено: ${unique.join(', ') || '0'}`);
    process.exit(1);
  }
  versions.set(file, unique[0]);
}

const uniqueVersions = [...new Set(versions.values())];
if (uniqueVersions.length !== 1) {
  for (const [file, version] of versions) console.error(`  ${file}: ${version}`);
  console.error('✗ Версия политики на frontend и в SQL рассинхронизирована.');
  process.exit(1);
}

console.log(`✓ Версия согласия синхронизирована: ${uniqueVersions[0]}`);
