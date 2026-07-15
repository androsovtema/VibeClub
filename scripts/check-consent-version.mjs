#!/usr/bin/env node
/**
 * Offline-проверка версии политики: историческая v2-migration неизменна, а
 * frontend/v4-upgrade/schema.sql синхронизированы на текущей v4.
 */
import { readFileSync, readdirSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const versionPattern = /privacy-\d{4}-\d{2}-\d{2}-v\d+/g;
const historicalSha256 = '53d46e399b9bac769086f5f3d933ede47c0c0db618060f924315b294cdbb0d36';

function versionsOf(file) {
  const matches = readFileSync(join(root, file), 'utf8').match(versionPattern) || [];
  return [...new Set(matches)];
}

const historicalNames = readdirSync(join(root, 'supabase', 'migrations'))
  .filter((name) => name.endsWith('_t_consent_01_user_consents.sql'));

if (historicalNames.length !== 1) {
  console.error(`✗ Ожидалась одна историческая T-CONSENT-01 migration, найдено: ${historicalNames.length}`);
  process.exit(1);
}

const historicalFile = `supabase/migrations/${historicalNames[0]}`;
const historicalContents = readFileSync(join(root, historicalFile));
const actualHistoricalSha256 = createHash('sha256').update(historicalContents).digest('hex');
if (actualHistoricalSha256 !== historicalSha256) {
  console.error(`✗ ${historicalFile}: SHA-256 не совпадает с применённой migration из e1d86dc.`);
  console.error(`  ожидался: ${historicalSha256}`);
  console.error(`  получен:  ${actualHistoricalSha256}`);
  process.exit(1);
}

const historicalVersions = versionsOf(historicalFile);
if (historicalVersions.length !== 1 || historicalVersions[0] !== 'privacy-2026-07-15-v2') {
  console.error(`✗ ${historicalFile}: ожидалась только неизменная v2, найдено: ${historicalVersions.join(', ') || '0'}`);
  process.exit(1);
}
console.log(`✓ Историческая migration неизменна: ${historicalVersions[0]}, SHA-256 ${actualHistoricalSha256}`);

const upgradeNames = readdirSync(join(root, 'supabase', 'migrations'))
  .filter((name) => name.endsWith('_t_consent_v4_upgrade.sql'));

if (upgradeNames.length !== 1) {
  console.error(`✗ Ожидалась ровно одна v4 upgrade migration, найдено: ${upgradeNames.length}`);
  process.exit(1);
}

const currentFiles = [
  'js/consent.js',
  `supabase/migrations/${upgradeNames[0]}`,
  'supabase/schema.sql'
];
const currentVersions = new Map();

for (const file of currentFiles) {
  const unique = versionsOf(file);
  if (unique.length !== 1) {
    console.error(`✗ ${file}: ожидалась одна текущая версия политики, найдено: ${unique.join(', ') || '0'}`);
    process.exit(1);
  }
  currentVersions.set(file, unique[0]);
}

const uniqueCurrent = [...new Set(currentVersions.values())];
if (uniqueCurrent.length !== 1) {
  for (const [file, version] of currentVersions) console.error(`  ${file}: ${version}`);
  console.error('✗ Текущая версия политики на frontend и в SQL рассинхронизирована.');
  process.exit(1);
}

if (uniqueCurrent[0] === historicalVersions[0]) {
  console.error(`✗ Текущая версия совпадает с исторической (${uniqueCurrent[0]}) — upgrade не поднял версию.`);
  process.exit(1);
}

console.log(`✓ Версия согласия синхронизирована: ${uniqueCurrent[0]} (v4 upgrade: ${upgradeNames[0]})`);
