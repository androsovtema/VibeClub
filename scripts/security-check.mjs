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
 *   7) проверить приватность журнала, grant/revoke и DB-гейт контактов
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
import {
  PRIVACY_POLICY_VERSION,
  PROFILE_CONTACT_FIELDS,
  DISSEMINATION_SCOPE_PURPOSE
} from '../js/consent.js';

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
const json = async (response) => response.json().catch(() => null);

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

const profileSelect = ['bio', ...PROFILE_CONTACT_FIELDS].join(',');
const originalProfileRes = await fetch(
  `${URL}/rest/v1/profiles?id=eq.${uid}&select=${profileSelect}`,
  { headers: authed }
);
const originalProfile = (await json(originalProfileRes))?.[0];
if (!originalProfileRes.ok || !originalProfile) {
  console.error('✗ Не удалось сохранить исходное состояние тестового профиля. Проверка остановлена до изменений.');
  process.exit(2);
}

async function activeDisseminationRows() {
  const response = await fetch(
    `${URL}/rest/v1/user_consents?consent_type=eq.dissemination&revoked_at=is.null&select=id,user_id,policy_version,granted_at,scope,subject_full_name,subject_contact`,
    { headers: authed }
  );
  return { response, rows: await json(response) };
}

function hasExpectedScope(scope) {
  return scope?.purpose === DISSEMINATION_SCOPE_PURPOSE &&
    Array.isArray(scope.fields) &&
    scope.fields.length === PROFILE_CONTACT_FIELDS.length &&
    PROFILE_CONTACT_FIELDS.every((field, index) => scope.fields[index] === field);
}

async function runConsentChecks() {
  console.log('\nT-CONSENT — журнал, RPC и контакты:');

  const initialActiveResult = await activeDisseminationRows();
  if (!initialActiveResult.response.ok || !Array.isArray(initialActiveResult.rows)) {
    bad(`не удалось прочитать собственное исходное согласие (HTTP ${initialActiveResult.response.status})`);
    return;
  }

  // Не отзываем реальное действующее согласие и не заменяем его новой датой:
  // security-check запускается на отдельной member-учётке без active consent.
  if (initialActiveResult.rows.length > 0) {
    bad('у тестовой учётки уже есть active dissemination; используй отдельную member-учётку без действующего согласия');
    return;
  }

  const originalHasContacts = PROFILE_CONTACT_FIELDS.some((field) => Boolean(originalProfile[field]));
  if (originalHasContacts) {
    bad('у тестовой учётки заполнены контакты; destructive consent-check остановлен до изменений');
    return;
  }

  let cleanupError = null;
  try {
    const anonRead = await fetch(`${URL}/rest/v1/user_consents?select=id&limit=1`, { headers: base });
    if (anonRead.ok) bad(`аноним прочитал user_consents (HTTP ${anonRead.status})`);
    else ok(`anon не читает user_consents (HTTP ${anonRead.status})`);

    const ownRead = await fetch(`${URL}/rest/v1/user_consents?select=id,user_id`, { headers: authed });
    const ownRows = await json(ownRead);
    if (ownRead.ok && Array.isArray(ownRows) && ownRows.every((row) => row.user_id === uid)) {
      ok(`участник читает только свои consent rows (${ownRows.length})`);
    } else {
      bad(`select журнала нарушен (HTTP ${ownRead.status})`);
    }

    const directInsert = await fetch(`${URL}/rest/v1/user_consents`, {
      method: 'POST',
      headers: { ...authed, Prefer: 'return=representation' },
      body: JSON.stringify({
        user_id: uid,
        consent_type: 'dissemination',
        policy_version: PRIVACY_POLICY_VERSION,
        scope: {}
      })
    });
    if (directInsert.ok) bad('прямой INSERT user_consents прошёл');
    else ok(`прямой INSERT user_consents отбит (HTTP ${directInsert.status})`);

    const ownConsentId = ownRows?.[0]?.id || '00000000-0000-0000-0000-000000000000';
    const directUpdate = await fetch(`${URL}/rest/v1/user_consents?id=eq.${ownConsentId}`, {
      method: 'PATCH', headers: authed, body: JSON.stringify({ revoked_at: new Date().toISOString() })
    });
    if (directUpdate.ok) bad('прямой UPDATE user_consents прошёл');
    else ok(`прямой UPDATE user_consents отбит (HTTP ${directUpdate.status})`);

    const directDelete = await fetch(`${URL}/rest/v1/user_consents?id=eq.${ownConsentId}`, {
      method: 'DELETE', headers: authed
    });
    if (directDelete.ok) bad('прямой DELETE user_consents прошёл');
    else ok(`прямой DELETE user_consents отбит (HTTP ${directDelete.status})`);

    const revokeBeforePatch = await fetch(`${URL}/rest/v1/rpc/revoke_profile_dissemination`, {
      method: 'POST', headers: authed, body: '{}'
    });
    if (!revokeBeforePatch.ok) throw new Error(`prepare revoke HTTP ${revokeBeforePatch.status}`);

    const blockedContact = await fetch(`${URL}/rest/v1/profiles?id=eq.${uid}`, {
      method: 'PATCH',
      headers: { ...authed, Prefer: 'return=representation' },
      body: JSON.stringify({ telegram: 'security_check_without_consent' })
    });
    if (blockedContact.ok) bad('контакт сохранился без active dissemination');
    else ok(`контакт без active dissemination отбит (HTTP ${blockedContact.status})`);

    const consentFullName = 'Security Check Member';
    const staleGrantBody = JSON.stringify({
      subject_full_name: consentFullName,
      submitted_policy_version: 'privacy-2026-07-15-v2'
    });
    const staleGrant = await fetch(`${URL}/rest/v1/rpc/grant_profile_dissemination`, {
      method: 'POST', headers: authed, body: staleGrantBody
    });
    const activeAfterStaleGrant = await activeDisseminationRows();
    const activeAfterStaleRows = Array.isArray(activeAfterStaleGrant.rows) ? activeAfterStaleGrant.rows : [];
    if (!staleGrant.ok && activeAfterStaleRows.length === 0) {
      ok(`grant RPC со старой/подменённой версией отбит (HTTP ${staleGrant.status}), consent row не создан`);
    } else {
      bad(`ДЫРА: grant RPC принял чужую версию политики (HTTP ${staleGrant.status}, active=${activeAfterStaleRows.length})`);
    }

    const grantBody = JSON.stringify({
      subject_full_name: consentFullName,
      submitted_policy_version: PRIVACY_POLICY_VERSION
    });
    const grant = await fetch(`${URL}/rest/v1/rpc/grant_profile_dissemination`, {
      method: 'POST', headers: authed, body: grantBody
    });
    const firstConsentId = await json(grant);
    const grantAgain = await fetch(`${URL}/rest/v1/rpc/grant_profile_dissemination`, {
      method: 'POST', headers: authed, body: grantBody
    });
    const secondConsentId = await json(grantAgain);
    const activeAfterGrant = await activeDisseminationRows();
    const activeRows = Array.isArray(activeAfterGrant.rows) ? activeAfterGrant.rows : [];
    const active = activeRows[0];
    const grantedAt = Date.parse(active?.granted_at || '');
    const serverDated = Number.isFinite(grantedAt) && Math.abs(Date.now() - grantedAt) < 5 * 60 * 1000;
    if (grant.ok && grantAgain.ok && firstConsentId === secondConsentId && activeRows.length === 1 &&
        active?.user_id === uid && active?.policy_version === PRIVACY_POLICY_VERSION &&
        active?.subject_full_name === consentFullName && Boolean(active?.subject_contact) &&
        hasExpectedScope(active?.scope) && serverDated) {
      ok('grant RPC создал одну идемпотентную серверно датированную запись текущей версии');
    } else {
      bad(`grant RPC нарушен (HTTP ${grant.status}/${grantAgain.status}, active=${activeRows.length})`);
    }

    const contactValue = `security_check_${uid.slice(0, 8)}`;
    const saveContact = await fetch(`${URL}/rest/v1/profiles?id=eq.${uid}`, {
      method: 'PATCH', headers: { ...authed, Prefer: 'return=representation' },
      body: JSON.stringify({ telegram: contactValue })
    });
    const savedContact = (await json(saveContact))?.[0]?.telegram;
    if (saveContact.ok && savedContact === contactValue) ok('после grant контакт сохраняется');
    else bad(`после grant контакт не сохранился (HTTP ${saveContact.status})`);

    const revoke = await fetch(`${URL}/rest/v1/rpc/revoke_profile_dissemination`, {
      method: 'POST', headers: authed, body: '{}'
    });
    const contactAfterRevokeRes = await fetch(
      `${URL}/rest/v1/profiles?id=eq.${uid}&select=${PROFILE_CONTACT_FIELDS.join(',')}`,
      { headers: authed }
    );
    const contactAfterRevoke = (await json(contactAfterRevokeRes))?.[0];
    const rowsAfterRevoke = await activeDisseminationRows();
    const cleared = contactAfterRevoke && PROFILE_CONTACT_FIELDS.every((field) => contactAfterRevoke[field] === null);
    if (revoke.ok && cleared && rowsAfterRevoke.rows?.length === 0) {
      ok('revoke закрыл consent и очистил семь контактов');
    } else {
      bad(`revoke не закрыл consent/контакты (HTTP ${revoke.status})`);
    }

    const revokeAgain = await fetch(`${URL}/rest/v1/rpc/revoke_profile_dissemination`, {
      method: 'POST', headers: authed, body: '{}'
    });
    if (revokeAgain.ok) ok('повторный revoke безопасен');
    else bad(`повторный revoke упал (HTTP ${revokeAgain.status})`);

    for (const functionName of [
      'current_privacy_policy_version',
      'handle_new_user',
      'protect_profile_contacts'
    ]) {
      const internalCall = await fetch(`${URL}/rest/v1/rpc/${functionName}`, {
        method: 'POST', headers: authed, body: '{}'
      });
      if (internalCall.ok) bad(`внутренняя функция ${functionName} доступна через RPC`);
      else ok(`внутренняя функция ${functionName} закрыта (HTTP ${internalCall.status})`);
    }
  } catch (error) {
    bad(`T-CONSENT проверка прервана: ${error.message}`);
  } finally {
    try {
      const restoreConsent = await fetch(`${URL}/rest/v1/rpc/revoke_profile_dissemination`, {
        method: 'POST', headers: authed, body: '{}'
      });
      if (!restoreConsent.ok) throw new Error(`revoke_profile_dissemination HTTP ${restoreConsent.status}`);

      const restoreProfile = await fetch(`${URL}/rest/v1/profiles?id=eq.${uid}`, {
        method: 'PATCH', headers: authed, body: JSON.stringify(originalProfile)
      });
      if (!restoreProfile.ok) throw new Error(`profile PATCH HTTP ${restoreProfile.status}`);
      ok('исходное состояние тестового профиля восстановлено');
    } catch (error) {
      cleanupError = error;
      bad(`НЕ УДАЛОСЬ восстановить тестовый профиль: ${error.message}`);
    }
  }

  if (cleanupError) process.exitCode = 1;
}

await runConsentChecks();

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
  // Участник может создать обращение, но не имеет SELECT к списку feedback.
  // Поэтому не просим PostgREST вернуть созданную строку: UI работает так же.
  method: 'POST', headers: authed,
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
  // восстанавливаем исходное значение, а не обнуляем пользовательские данные
  const restoreBio = await fetch(`${URL}/rest/v1/profiles?id=eq.${uid}`, {
    method: 'PATCH', headers: authed, body: JSON.stringify({ bio: originalProfile.bio })
  });
  if (!restoreBio.ok) bad(`НЕ УДАЛОСЬ восстановить исходное bio (HTTP ${restoreBio.status})`);
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
