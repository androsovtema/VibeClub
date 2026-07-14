#!/usr/bin/env node
/**
 * We Designerz — перенос файлов бакета `covers` из Supabase Cloud в
 * self-hosted Storage (T-LOC, RUNBOOK.md шаг 4). Без npm-зависимостей —
 * только fetch, как в scripts/security-check.mjs.
 *
 * Нужны service_role ОБОИХ проектов (никогда не в репо, никогда во фронте —
 * передавать только через переменные окружения на время запуска).
 *
 * Запуск:
 *   OLD_URL=https://ndhyvspgkelxgqmfmmry.supabase.co \
 *   OLD_SERVICE_ROLE=... \
 *   NEW_URL=https://api.wedesignerz.com \
 *   NEW_SERVICE_ROLE=... \
 *   node infra/scripts/copy-storage.mjs
 *
 * Бакет `covers` в новом проекте должен уже существовать (создаётся schema.sql,
 * см. RUNBOOK.md шаг 3 — прогнать ДО этого скрипта).
 */

const { OLD_URL, OLD_SERVICE_ROLE, NEW_URL, NEW_SERVICE_ROLE, BUCKET = 'covers' } = process.env;

if (!OLD_URL || !OLD_SERVICE_ROLE || !NEW_URL || !NEW_SERVICE_ROLE) {
  console.error('Нужны env: OLD_URL, OLD_SERVICE_ROLE, NEW_URL, NEW_SERVICE_ROLE');
  console.error('(BUCKET по умолчанию — covers)');
  process.exit(2);
}

async function listLevel(prefix) {
  const res = await fetch(`${OLD_URL}/storage/v1/object/list/${BUCKET}`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${OLD_SERVICE_ROLE}`,
      apikey: OLD_SERVICE_ROLE,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({ prefix, limit: 1000, offset: 0, sortBy: { column: 'name', order: 'asc' } })
  });
  if (!res.ok) throw new Error(`list "${prefix}" failed: ${res.status} ${await res.text()}`);
  return res.json();
}

// Storage API отдаёт «плоский» список одного уровня; папки — записи с id===null.
// Наша структура — covers/<uid>/<файл>, поэтому рекурсия неглубокая.
async function walk(prefix = '') {
  const entries = await listLevel(prefix);
  let files = [];
  for (const entry of entries) {
    if (entry.id === null) {
      files = files.concat(await walk(`${prefix}${entry.name}/`));
    } else {
      files.push(`${prefix}${entry.name}`);
    }
  }
  return files;
}

async function copyFile(path) {
  const downloadRes = await fetch(`${OLD_URL}/storage/v1/object/${BUCKET}/${path}`, {
    headers: { Authorization: `Bearer ${OLD_SERVICE_ROLE}`, apikey: OLD_SERVICE_ROLE }
  });
  if (!downloadRes.ok) throw new Error(`download failed: ${downloadRes.status}`);
  const contentType = downloadRes.headers.get('content-type') || 'application/octet-stream';
  const buf = Buffer.from(await downloadRes.arrayBuffer());

  const uploadRes = await fetch(`${NEW_URL}/storage/v1/object/${BUCKET}/${path}`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${NEW_SERVICE_ROLE}`,
      apikey: NEW_SERVICE_ROLE,
      'Content-Type': contentType,
      'x-upsert': 'true'
    },
    body: buf
  });
  if (!uploadRes.ok) throw new Error(`upload failed: ${uploadRes.status} ${await uploadRes.text()}`);
}

const files = await walk();
console.log(`Найдено файлов в "${BUCKET}": ${files.length}`);

let ok = 0;
for (const path of files) {
  try {
    await copyFile(path);
    ok += 1;
    console.log(`  ✓ ${path}`);
  } catch (err) {
    console.error(`  ✗ ${path}: ${err.message}`);
  }
}

console.log(`\nГотово: ${ok}/${files.length} файлов перенесено.`);
if (ok < files.length) process.exit(1);
