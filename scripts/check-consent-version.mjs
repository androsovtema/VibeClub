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
const v4UpgradeSha256 = 'a6b4ef80e581708b40dc73ce256e0f009831822319cc2734cfa62b38720a1629';

function contentsOf(file) {
  return readFileSync(join(root, file), 'utf8');
}

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

const upgradeFile = `supabase/migrations/${upgradeNames[0]}`;
const actualUpgradeSha256 = createHash('sha256').update(contentsOf(upgradeFile)).digest('hex');
if (actualUpgradeSha256 !== v4UpgradeSha256) {
  console.error(`✗ ${upgradeFile}: SHA-256 не совпадает с применённой v4 migration из f76053c.`);
  console.error(`  ожидался: ${v4UpgradeSha256}`);
  console.error(`  получен:  ${actualUpgradeSha256}`);
  process.exit(1);
}

const currentFiles = [
  'js/consent.js',
  upgradeFile,
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

const reconsentNames = readdirSync(join(root, 'supabase', 'migrations'))
  .filter((name) => name.endsWith('_t_consent_reconsent.sql'));

if (reconsentNames.length !== 1) {
  console.error(`✗ Ожидалась ровно одна re-consent migration, найдено: ${reconsentNames.length}`);
  process.exit(1);
}

const reconsentFile = `supabase/migrations/${reconsentNames[0]}`;
const reconsentAclFixNames = readdirSync(join(root, 'supabase', 'migrations'))
  .filter((name) => name.endsWith('_t_consent_reconsent_acl_fix.sql'));

if (reconsentAclFixNames.length !== 1) {
  console.error(`✗ Ожидалась ровно одна re-consent ACL-fix migration, найдено: ${reconsentAclFixNames.length}`);
  process.exit(1);
}

const reconsentAclFixFile = `supabase/migrations/${reconsentAclFixNames[0]}`;
const processingRpcFiles = [reconsentFile, 'supabase/schema.sql'];
const exactSignature = /create\s+or\s+replace\s+function\s+public\.grant_processing_consent\s*\(\s*submitted_policy_version\s+text\s*\)/gi;
const anySignature = /create\s+(?:or\s+replace\s+)?function\s+public\.grant_processing_consent\s*\(/gi;
const revokeAcl = /revoke\s+execute\s+on\s+function\s+public\.grant_processing_consent\s*\(\s*text\s*\)\s+from\s+public\s*,\s*anon/gi;
const grantAcl = /grant\s+execute\s+on\s+function\s+public\.grant_processing_consent\s*\(\s*text\s*\)\s+to\s+authenticated/gi;
const revokeServiceRoleAcl = /revoke\s+execute\s+on\s+function\s+public\.grant_processing_consent\s*\(\s*text\s*\)\s+from\s+service_role/gi;
const processingRpcBlock = /create\s+or\s+replace\s+function\s+public\.grant_processing_consent[\s\S]*?grant\s+execute\s+on\s+function\s+public\.grant_processing_consent\s*\(\s*text\s*\)\s+to\s+authenticated\s*;/i;

for (const file of processingRpcFiles) {
  const contents = contentsOf(file);
  const exactMatches = contents.match(exactSignature) || [];
  const allMatches = contents.match(anySignature) || [];
  if (exactMatches.length !== 1 || allMatches.length !== 1) {
    console.error(`✗ ${file}: ожидалась одна точная grant_processing_consent(text), найдено ${exactMatches.length}/${allMatches.length}.`);
    process.exit(1);
  }
  if ((contents.match(revokeAcl) || []).length !== 1 ||
      (contents.match(grantAcl) || []).length !== 1) {
    console.error(`✗ ${file}: ACL grant_processing_consent должен закрывать PUBLIC/anon и разрешать authenticated.`);
    process.exit(1);
  }
}

const aclFixContents = contentsOf(reconsentAclFixFile);
const aclFixRevoke = /revoke\s+execute\s+on\s+function\s+public\.grant_processing_consent\s*\(\s*text\s*\)\s+from\s+public\s*,\s*anon\s*,\s*service_role/i;
if (!aclFixRevoke.test(aclFixContents) ||
    (aclFixContents.match(grantAcl) || []).length !== 1 ||
    (contentsOf('supabase/schema.sql').match(revokeServiceRoleAcl) || []).length !== 1) {
  console.error('✗ Re-consent ACL-fix должна закрывать PUBLIC/anon/service_role и сохранять authenticated.');
  process.exit(1);
}

const normalizeSql = (sql) => sql
  .replace(/--[^\n]*/g, '')
  .replace(/\s+/g, ' ')
  .trim();
const migrationRpcBlock = contentsOf(reconsentFile).match(processingRpcBlock)?.[0];
const schemaRpcBlock = contentsOf('supabase/schema.sql').match(processingRpcBlock)?.[0];
if (!migrationRpcBlock || !schemaRpcBlock ||
    normalizeSql(migrationRpcBlock) !== normalizeSql(schemaRpcBlock)) {
  console.error('✗ grant_processing_consent в migration и schema.sql рассинхронизирована.');
  process.exit(1);
}

const reconsentUi = contentsOf('js/ui/reconsentModal.js');
const frontendRpc = /rpc\(\s*['"]grant_processing_consent['"]\s*,\s*\{\s*submitted_policy_version:\s*PRIVACY_POLICY_VERSION\s*\}/;
if (!frontendRpc.test(reconsentUi)) {
  console.error('✗ js/ui/reconsentModal.js не передаёт PRIVACY_POLICY_VERSION в grant_processing_consent.');
  process.exit(1);
}

const appEntry = contentsOf('js/app.js');
if (/onAuthChange\s*\(\s*async\b/.test(appEntry)) {
  console.error('✗ onAuthChange не должен быть async: Supabase API внутри callback может зависнуть.');
  process.exit(1);
}

console.log(`✓ Re-consent RPC синхронизирована и закрыта ACL: ${reconsentNames[0]} + ${reconsentAclFixNames[0]}`);
