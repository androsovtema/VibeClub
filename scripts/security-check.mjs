#!/usr/bin/env node
/**
 * Проверка RLS-защиты привилегированных колонок (T-SEC1, аудит 2026-07-14).
 * Логинится ОБЫЧНОЙ (не-admin) учёткой и пробует атаки:
 *   1) выставить себе role='admin'
 *   2) выставить себе is_core=true на своём pending-проекте
 *   3) накрутить projects.upvotes прямым PATCH (SEC-02)
 *   4) подменить projects.created_at (SEC-11)
 *   5) анонимно получить листинг bucket covers (SEC-18)
 *   6) анонимно вставить запись в feedback (SEC-05)
 * Все должны отбиться. Если проходят — миграция не применена или сломана.
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

if (!process.env.WDZ_TEST_JWT && (!email || !password)) {
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
// SEC-10: в проде включена капча Turnstile — парольный логин из скрипта отбивается
// кодом captcha_failed. Обход для проверки: передать готовый JWT сессии через env
// WDZ_TEST_JWT (взять в браузере: залогиниться тестовой учёткой →
// localStorage['sb-<ref>-auth-token'] → поле access_token).
let uid;
let accessToken = process.env.WDZ_TEST_JWT;
if (accessToken) {
  const payload = JSON.parse(Buffer.from(accessToken.split('.')[1], 'base64url').toString());
  uid = payload.sub;
  console.log('\nИспользую JWT из WDZ_TEST_JWT');
} else {
  const authRes = await fetch(`${URL}/auth/v1/token?grant_type=password`, {
    method: 'POST', headers: base, body: JSON.stringify({ email, password })
  });
  const auth = await authRes.json();
  if (auth.error_code === 'captcha_failed') {
    console.error('✗ Логин отбит капчей (SEC-10 включён) — это норма для прода.');
    console.error('  Передай готовый JWT сессии: WDZ_TEST_JWT=<access_token> node scripts/security-check.mjs');
    process.exit(2);
  }
  if (!authRes.ok || !auth.access_token) {
    console.error('✗ Логин не удался:', auth.error_description || auth.msg || authRes.status);
    console.error('  Проверь email/пароль и что почта подтверждена.');
    process.exit(2);
  }
  uid = auth.user.id;
  accessToken = auth.access_token;
}
const authed = { ...base, Authorization: `Bearer ${accessToken}` };
console.log(`\nВошёл как ${email || 'JWT-учётка'} (uid ${uid.slice(0, 8)}…)\n`);

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
let proj = (await (await fetch(
  `${URL}/rest/v1/projects?author_id=eq.${uid}&status=eq.pending&select=id,is_core&limit=1`,
  { headers: authed })).json())[0];

// нет своего pending — создадим временный, потом удалим
let temp = false;
if (!proj) {
  const created = await fetch(`${URL}/rest/v1/projects`, {
    method: 'POST', headers: { ...authed, Prefer: 'return=representation' },
    body: JSON.stringify({ author_id: uid, title: 'security-check temp', status: 'pending' })
  });
  proj = (await created.json().catch(() => []))[0];
  temp = !!proj;
  if (!proj) console.log('  — не смог создать временный проект, пропускаю (триггер общий с role)');
}

if (proj) {
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
  // --- Атака 3: накрутка upvotes прямым PATCH (SEC-02) ---
  console.log('\nАтака 3 — накрутка projects.upvotes прямым PATCH:');
  const up = await fetch(`${URL}/rest/v1/projects?id=eq.${proj.id}`, {
    method: 'PATCH', headers: { ...authed, Prefer: 'return=representation' },
    body: JSON.stringify({ upvotes: 9999 })
  });
  const upBody = await up.json().catch(() => null);
  const upAfter = (await (await fetch(`${URL}/rest/v1/projects?id=eq.${proj.id}&select=upvotes`, { headers: authed })).json())[0]?.upvotes;
  if (upAfter === 9999) {
    bad(`ДЫРА: upvotes стал 9999 (HTTP ${up.status}). Триггер не защищает счётчик!`);
  } else if (!up.ok) {
    ok(`отбито (HTTP ${up.status}: ${upBody?.message || 'ошибка'}), upvotes остался ${upAfter}`);
  } else {
    bad(`PATCH прошёл (HTTP ${up.status}), upvotes=${upAfter} — проверь вручную`);
  }

  // --- Атака 4: подмена created_at (SEC-11) ---
  console.log('\nАтака 4 — подмена projects.created_at:');
  const fake = '2000-01-01T00:00:00Z';
  const ca = await fetch(`${URL}/rest/v1/projects?id=eq.${proj.id}`, {
    method: 'PATCH', headers: { ...authed, Prefer: 'return=representation' },
    body: JSON.stringify({ created_at: fake })
  });
  const caBody = await ca.json().catch(() => null);
  const caAfter = (await (await fetch(`${URL}/rest/v1/projects?id=eq.${proj.id}&select=created_at`, { headers: authed })).json())[0]?.created_at;
  if (caAfter && new Date(caAfter).getFullYear() === 2000) {
    bad(`ДЫРА: created_at переписан на ${caAfter} (HTTP ${ca.status})`);
  } else if (!ca.ok) {
    ok(`отбито (HTTP ${ca.status}: ${caBody?.message || 'ошибка'})`);
  } else {
    bad(`PATCH прошёл (HTTP ${ca.status}), created_at=${caAfter} — проверь вручную`);
  }

  // убираем временный проект
  if (temp) {
    await fetch(`${URL}/rest/v1/projects?id=eq.${proj.id}`, { method: 'DELETE', headers: authed });
  }
}

// --- Атака 5: анонимный листинг объектов storage (SEC-18) ---
console.log('\nАтака 5 — анонимный листинг bucket covers:');
const listRes = await fetch(`${URL}/storage/v1/object/list/covers`, {
  method: 'POST', headers: base, body: JSON.stringify({ prefix: '', limit: 100 })
});
const listBody = await listRes.json().catch(() => null);
if (listRes.ok && Array.isArray(listBody) && listBody.length > 0) {
  bad(`ДЫРА: аноним получил список ${listBody.length} объектов (HTTP ${listRes.status})`);
} else if (listRes.ok && Array.isArray(listBody) && listBody.length === 0) {
  ok(`листинг вернул пусто (HTTP ${listRes.status}) — SELECT-политика закрыта`);
} else {
  ok(`отбито (HTTP ${listRes.status})`);
}

// --- Атака 6: анонимный insert в feedback (SEC-05) ---
console.log('\nАтака 6 — анонимный insert в feedback:');
const fb = await fetch(`${URL}/rest/v1/feedback`, {
  method: 'POST', headers: { ...base, Prefer: 'return=representation' },
  body: JSON.stringify({ page: '/security-check', message: 'security-check: анонимный спам-тест' })
});
const fbBody = await fb.json().catch(() => null);
if (fb.ok) {
  bad(`ДЫРА: аноним вставил feedback (HTTP ${fb.status}). Политика feedback_insert_auth не применена!`);
} else {
  ok(`отбито (HTTP ${fb.status}: ${fbBody?.message || 'ошибка'})`);
}

// авторизованный insert должен работать (контроль для SEC-05)
console.log('\nКонтроль — feedback от залогиненного должен работать:');
const fbAuth = await fetch(`${URL}/rest/v1/feedback`, {
  method: 'POST', headers: { ...authed, Prefer: 'return=representation' },
  body: JSON.stringify({ user_id: uid, page: '/security-check', message: 'security-check: легитимный тест feedback' })
});
const fbAuthBody = await fbAuth.json().catch(() => null);
if (fbAuth.ok) {
  ok(`insert прошёл (HTTP ${fbAuth.status}) — легитимный feedback не сломан`);
  // почистить не можем (delete-политики нет намеренно) — Тёма увидит тестовую запись в админке
} else {
  bad(`insert НЕ прошёл (HTTP ${fbAuth.status}): ${fbAuthBody?.message || JSON.stringify(fbAuthBody)}`);
}

// --- Контроль: обычное редактирование профиля должно РАБОТАТЬ ---
console.log('\nКонтроль — обычное редактирование (bio) должно работать:');
const bio = await fetch(`${URL}/rest/v1/profiles?id=eq.${uid}`, {
  method: 'PATCH', headers: { ...authed, Prefer: 'return=representation' },
  body: JSON.stringify({ bio: 'security-check ping' })
});
const bioBody = await bio.json().catch(() => null);
if (bio.ok) {
  ok(`bio обновился (HTTP ${bio.status}) — легитимный доступ не сломан`);
  // почистим тестовую пометку
  await fetch(`${URL}/rest/v1/profiles?id=eq.${uid}`, {
    method: 'PATCH', headers: authed, body: JSON.stringify({ bio: null })
  });
} else {
  const msg = bioBody?.message || bioBody?.hint || JSON.stringify(bioBody);
  bad(`bio НЕ обновился (HTTP ${bio.status}): ${msg}`);
}

console.log(`\n${'─'.repeat(48)}`);
if (fail === 0) {
  console.log(`✓ ВСЁ ЧИСТО: защита работает (${pass} проверок).`);
  process.exit(0);
} else {
  console.log(`✗ ПРОБЛЕМЫ: ${fail} провалов, ${pass} ок. Разбирайся до анонса.`);
  process.exit(1);
}
