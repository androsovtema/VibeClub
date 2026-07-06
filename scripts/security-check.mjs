#!/usr/bin/env node
/**
 * Проверка RLS-защиты привилегированных колонок (T-SEC1).
 * Логинится ОБЫЧНОЙ (не-admin) учёткой и пробует две атаки:
 *   1) выставить себе role='admin'
 *   2) выставить себе is_core=true на своём pending-проекте
 * Обе должны отбиться. Если проходят — миграция не применена или сломана.
 *
 * Запуск:
 *   node scripts/security-check.mjs you@example.com твой_пароль
 * или через env:
 *   WDZ_TEST_EMAIL=... WDZ_TEST_PASSWORD=... node scripts/security-check.mjs
 *
 * Учётка нужна ОБЫЧНАЯ (role='member'), не твоя админская — иначе проверка
 * бессмысленна (админу менять role/is_core можно). Заведи тестовую через сайт.
 */

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));

// --- читаем URL и anon-ключ из js/config.js, не дублируем ---
const configSrc = readFileSync(join(__dirname, '..', 'js', 'config.js'), 'utf8');
const URL = configSrc.match(/SUPABASE_URL\s*=\s*'([^']+)'/)?.[1];
const ANON = configSrc.match(/SUPABASE_ANON_KEY\s*=\s*\n?\s*'([^']+)'/)?.[1];

if (!URL || !ANON) {
  console.error('✗ Не нашёл SUPABASE_URL / SUPABASE_ANON_KEY в js/config.js');
  process.exit(2);
}

const email = process.argv[2] || process.env.WDZ_TEST_EMAIL;
const password = process.argv[3] || process.env.WDZ_TEST_PASSWORD;

if (!email || !password) {
  console.error('Использование: node scripts/security-check.mjs <email> <пароль>');
  console.error('Учётка — обычная (member), НЕ админская. Заведи тестовую через сайт.');
  process.exit(2);
}

const base = { apikey: ANON, 'Content-Type': 'application/json' };
let pass = 0;
let fail = 0;
const ok = (m) => { console.log(`  ✓ ${m}`); pass++; };
const bad = (m) => { console.log(`  ✗ ${m}`); fail++; };

// --- 1. логин, получаем JWT ---
const authRes = await fetch(`${URL}/auth/v1/token?grant_type=password`, {
  method: 'POST', headers: base, body: JSON.stringify({ email, password })
});
const auth = await authRes.json();
if (!authRes.ok || !auth.access_token) {
  console.error('✗ Логин не удался:', auth.error_description || auth.msg || authRes.status);
  console.error('  Проверь email/пароль и что почта подтверждена.');
  process.exit(2);
}
const uid = auth.user.id;
const authed = { ...base, Authorization: `Bearer ${auth.access_token}` };
console.log(`\nВошёл как ${email} (uid ${uid.slice(0, 8)}…)\n`);

// проверим, что учётка НЕ админская — иначе тест невалиден
const meRes = await fetch(`${URL}/rest/v1/profiles?id=eq.${uid}&select=role`, { headers: authed });
const me = (await meRes.json())[0];
if (me?.role === 'admin') {
  console.error('✗ Эта учётка — admin. Нужна ОБЫЧНАЯ (member), иначе проверка бессмысленна.');
  process.exit(2);
}
console.log(`Роль учётки: ${me?.role ?? '?'} (ожидается member)\n`);

// --- Атака 1: эскалация role → admin ---
console.log('Атака 1 — эскалация role → admin:');
const esc = await fetch(`${URL}/rest/v1/profiles?id=eq.${uid}`, {
  method: 'PATCH', headers: { ...authed, Prefer: 'return=representation' },
  body: JSON.stringify({ role: 'admin' })
});
const escBody = await esc.json().catch(() => null);
const roleAfter = (await (await fetch(`${URL}/rest/v1/profiles?id=eq.${uid}&select=role`, { headers: authed })).json())[0]?.role;
if (roleAfter === 'admin') {
  bad(`ДЫРА: role стал admin (HTTP ${esc.status}). Миграция НЕ применена или сломана!`);
} else if (!esc.ok) {
  ok(`отбито (HTTP ${esc.status}: ${escBody?.message || 'ошибка'}), role остался ${roleAfter}`);
} else {
  bad(`PATCH прошёл (HTTP ${esc.status}), но role=${roleAfter} — проверь вручную`);
}

// --- Атака 2: самопростановка is_core на своём pending-проекте ---
console.log('\nАтака 2 — самопростановка is_core:');
const proj = (await (await fetch(
  `${URL}/rest/v1/projects?author_id=eq.${uid}&status=eq.pending&select=id,is_core&limit=1`,
  { headers: authed })).json())[0];
if (!proj) {
  console.log('  — пропущено: нет своего pending-проекта. Добавь проект через сайт и повтори,');
  console.log('    либо доверься тому, что триггер общий (та же функция, что для role).');
} else {
  const core = await fetch(`${URL}/rest/v1/projects?id=eq.${proj.id}`, {
    method: 'PATCH', headers: { ...authed, Prefer: 'return=representation' },
    body: JSON.stringify({ is_core: true })
  });
  const coreBody = await core.json().catch(() => null);
  const coreAfter = (await (await fetch(`${URL}/rest/v1/projects?id=eq.${proj.id}&select=is_core`, { headers: authed })).json())[0]?.is_core;
  if (coreAfter === true) {
    bad(`ДЫРА: is_core стал true (HTTP ${core.status})`);
  } else if (!core.ok) {
    ok(`отбито (HTTP ${core.status}: ${coreBody?.message || 'ошибка'}), is_core остался ${coreAfter}`);
  } else {
    bad(`PATCH прошёл (HTTP ${core.status}), is_core=${coreAfter}`);
  }
}

// --- Контроль: обычное редактирование профиля должно РАБОТАТЬ ---
console.log('\nКонтроль — обычное редактирование (bio) должно работать:');
const bio = await fetch(`${URL}/rest/v1/profiles?id=eq.${uid}`, {
  method: 'PATCH', headers: authed, body: JSON.stringify({ bio: 'security-check ping' })
});
bio.ok ? ok(`bio обновился (HTTP ${bio.status}) — легитимный доступ не сломан`)
       : bad(`bio НЕ обновился (HTTP ${bio.status}) — триггер зарезал лишнее!`);

console.log(`\n${'─'.repeat(48)}`);
if (fail === 0) {
  console.log(`✓ ВСЁ ЧИСТО: защита работает (${pass} проверок).`);
  process.exit(0);
} else {
  console.log(`✗ ПРОБЛЕМЫ: ${fail} провалов, ${pass} ок. Разбирайся до анонса.`);
  process.exit(1);
}
