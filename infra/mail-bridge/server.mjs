#!/usr/bin/env node
/**
 * We Designerz — мост GoTrue send-email hook → Unisender Go Web API (T-LOC).
 *
 * Зачем: self-hosted GoTrue умеет слать почту только по SMTP, а SMTP-порты
 * Unisender Go (smtp.go2.unisender.ru, 587/465) недоступны по TCP с VPS —
 * фильтрация на стороне провайдера/Unisender (диагностировано 2026-07-14,
 * см. infra/RUNBOOK.md, шаг 6). Web API Unisender при этом работает.
 * Решение: включить GoTrue HTTP send-email hook (GOTRUE_HOOK_SEND_EMAIL_*
 * в docker-compose.yml) и слать письма отсюда через Web API.
 *
 * Без npm-зависимостей — только stdlib (fetch встроен в Node 18+), как
 * infra/scripts/copy-storage.mjs. Слушает ТОЛЬКО внутреннюю docker-сеть —
 * порт наружу не публикуется (см. docker-compose.yml, сервис mail-bridge).
 *
 * Формат вебхука GoTrue (v2.189.0, internal/hooks/v0hooks/v0hooks.go):
 *   POST / { "user": {...}, "email_data": { "token_hash", "token_hash_new",
 *            "email_action_type", "redirect_to", "site_url", ... } }
 * Подпись — standard-webhooks (github.com/standard-webhooks/standard-webhooks):
 *   заголовки webhook-id / webhook-timestamp / webhook-signature,
 *   signature = base64(HMAC-SHA256(secret, `${id}.${timestamp}.${rawBody}`)),
 *   secret — часть после "whsec_" в SEND_EMAIL_HOOK_SECRET, base64-декодирована.
 *
 * Обязательные env: SEND_EMAIL_HOOK_SECRET, UNISENDER_API_URL,
 * UNISENDER_API_KEY, MAIL_FROM, MAIL_FROM_NAME, API_EXTERNAL_BASE.
 * Опциональные: PORT (по умолчанию 9998), MAIL_TEMPLATES_DIR (по умолчанию
 * ./mail-templates рядом со скриптом), MAILER_SUBJECTS_CONFIRMATION/
 * _RECOVERY/_EMAIL_CHANGE (тема письма — общий .env, уже используется GoTrue).
 */

import { createServer } from 'node:http';
import { createHmac, timingSafeEqual } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));

const REQUIRED_ENV = [
  'SEND_EMAIL_HOOK_SECRET',
  'UNISENDER_API_URL',
  'UNISENDER_API_KEY',
  'MAIL_FROM',
  'MAIL_FROM_NAME',
  'API_EXTERNAL_BASE'
];
const missing = REQUIRED_ENV.filter((k) => !process.env[k]);
if (missing.length) {
  console.error(`mail-bridge: не заданы обязательные env: ${missing.join(', ')}`);
  process.exit(1);
}

const PORT = Number(process.env.PORT || 9998);
const TEMPLATES_DIR = process.env.MAIL_TEMPLATES_DIR || join(__dirname, '..', 'mail-templates');
const MAX_BODY_BYTES = 256 * 1024; // с запасом больше лимита самого GoTrue (200KB)
const SIGNATURE_TOLERANCE_SECONDS = 5 * 60; // как в спеке standard-webhooks

// email_action_type (GoTrue internal/mailer/mail.go) -> имя файла шаблона.
// Переиспользуем существующие шаблоны (T21) — своих под invite/magiclink нет.
const TEMPLATE_BY_TYPE = {
  signup: 'confirmation.html',
  invite: 'confirmation.html',
  recovery: 'recovery.html',
  magiclink: 'recovery.html',
  email_change: 'email_change.html'
};

// Тема письма — берём из общего .env (те же переменные, что уже использует
// GOTRUE_MAILER_SUBJECTS_* в docker-compose.yml, hook их не переопределяет).
const SUBJECT_ENV_BY_TYPE = {
  signup: 'MAILER_SUBJECTS_CONFIRMATION',
  invite: 'MAILER_SUBJECTS_CONFIRMATION',
  recovery: 'MAILER_SUBJECTS_RECOVERY',
  magiclink: 'MAILER_SUBJECTS_RECOVERY',
  email_change: 'MAILER_SUBJECTS_EMAIL_CHANGE'
};

/**
 * Проверка подписи standard-webhooks. Секрет в env хранится в формате
 * `v1,whsec_<base64>` (так его ожидает и сам GoTrue в
 * GOTRUE_HOOK_SEND_EMAIL_SECRETS — переменная общая для обоих сервисов).
 */
function verifySignature(secretEnv, msgId, msgTimestamp, rawBody, sigHeader) {
  if (!secretEnv || !msgId || !msgTimestamp || !sigHeader) return false;

  let secretPart = secretEnv.trim();
  if (secretPart.startsWith('v1,')) secretPart = secretPart.slice(3);
  if (!secretPart.startsWith('whsec_')) return false;
  const b64 = secretPart.slice('whsec_'.length);

  let key;
  try {
    key = Buffer.from(b64, 'base64');
  } catch {
    return false;
  }
  if (key.length === 0) return false;

  const ts = Number(msgTimestamp);
  if (!Number.isFinite(ts)) return false;
  const now = Math.floor(Date.now() / 1000);
  if (Math.abs(now - ts) > SIGNATURE_TOLERANCE_SECONDS) return false;

  // Байт-в-байт, без прохода через строку — тот же payload, что подписал GoTrue.
  const signedContent = Buffer.concat([Buffer.from(`${msgId}.${ts}.`, 'utf8'), rawBody]);
  const expected = createHmac('sha256', key).update(signedContent).digest();

  // Заголовок — одна или несколько подписей вида "v1,<sig>", разделены
  // пробелом (GoTrue шлёт через ", ", но это тоже раскладывается пробелом).
  const candidates = String(sigHeader).split(/\s+/).filter(Boolean);
  for (const candidate of candidates) {
    const parts = candidate.split(',');
    if (parts.length < 2 || parts[0] !== 'v1') continue;
    let given;
    try {
      given = Buffer.from(parts[1], 'base64');
    } catch {
      continue;
    }
    if (given.length !== expected.length) continue;
    if (timingSafeEqual(given, expected)) return true;
  }
  return false;
}

function buildVerifyUrl(tokenHash, type, redirectTo) {
  const base = process.env.API_EXTERNAL_BASE.replace(/\/+$/, '');
  const qs = new URLSearchParams();
  qs.set('token', tokenHash);
  qs.set('type', type);
  if (redirectTo) qs.set('redirect_to', redirectTo);
  return `${base}/auth/v1/verify?${qs.toString()}`;
}

function renderTemplate(file, confirmationUrl) {
  const html = readFileSync(join(TEMPLATES_DIR, file), 'utf8');
  return html.replace(/\{\{\s*\.ConfirmationURL\s*\}\}/g, confirmationUrl);
}

async function sendViaUnisender({ to, subject, html }) {
  const res = await fetch(process.env.UNISENDER_API_URL, {
    method: 'POST',
    headers: { 'X-API-KEY': process.env.UNISENDER_API_KEY, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      message: {
        recipients: [{ email: to }],
        body: { html },
        subject,
        from_email: process.env.MAIL_FROM,
        from_name: process.env.MAIL_FROM_NAME
      }
    }),
    signal: AbortSignal.timeout(10_000)
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok || data.status !== 'success') {
    throw new Error(`unisender HTTP ${res.status}: ${JSON.stringify(data).slice(0, 300)}`);
  }
  return data;
}

/**
 * Обработка вебхука send_email. Кидает исключение при неустранимой ошибке
 * (вызывающий код превращает это в 500).
 */
async function handleSendEmail(payload) {
  const user = payload?.user;
  const emailData = payload?.email_data;
  const type = emailData?.email_action_type;

  if (!user?.email || !type) {
    throw new Error('malformed payload: нет user.email или email_data.email_action_type');
  }

  // email_change — особый случай: GoTrue шлёт ОДИН вызов хука, но token_hash
  // подтверждает НОВЫЙ адрес (user.new_email), а token_hash_new — если
  // включён secure email change — подтверждает СТАРЫЙ (user.email). Шлём
  // на каждый адрес своё письмо со своей ссылкой (см. GoTrue
  // internal/api/mail.go:sendEmail, комментарий BUG(cstockton) про обмен
  // местами Token/TokenHash для email_change).
  if (type === 'email_change') {
    const jobs = [];
    if (emailData.token_hash) {
      jobs.push({ to: user.new_email || user.email, tokenHash: emailData.token_hash });
    }
    if (emailData.token_hash_new) {
      jobs.push({ to: user.email, tokenHash: emailData.token_hash_new });
    }
    if (jobs.length === 0) throw new Error('email_change: в payload нет ни одного токена');

    const file = TEMPLATE_BY_TYPE.email_change;
    const subject = process.env[SUBJECT_ENV_BY_TYPE.email_change] || 'Смена почты — We Designerz';
    for (const job of jobs) {
      const url = buildVerifyUrl(job.tokenHash, type, emailData.redirect_to);
      const html = renderTemplate(file, url);
      await sendViaUnisender({ to: job.to, subject, html });
    }
    console.log(`mail-bridge: отправлено type=email_change получателей=${jobs.length} status=ok`);
    return;
  }

  const file = TEMPLATE_BY_TYPE[type];
  if (!file) {
    // Типы вне продуктовых флоу сайта (reauthentication, *_notification и
    // т.п.) — шаблонов под них нет и хук на них сейчас не рассчитан.
    // Не роняем запрос GoTrue: тихо подтверждаем, чтобы не блокировать
    // несвязанный флоу, только логируем факт.
    console.log(`mail-bridge: type=${type} не обрабатывается, пропущено`);
    return;
  }

  const subject = process.env[SUBJECT_ENV_BY_TYPE[type]] || 'We Designerz';
  const url = buildVerifyUrl(emailData.token_hash, type, emailData.redirect_to);
  const html = renderTemplate(file, url);
  await sendViaUnisender({ to: user.email, subject, html });
  console.log(`mail-bridge: отправлено type=${type} status=ok`);
}

async function readRawBody(req) {
  const chunks = [];
  let total = 0;
  for await (const chunk of req) {
    total += chunk.length;
    if (total > MAX_BODY_BYTES) throw new Error('payload too large');
    chunks.push(chunk);
  }
  return Buffer.concat(chunks);
}

const server = createServer(async (req, res) => {
  if (req.method === 'GET' && req.url === '/health') {
    res.writeHead(200, { 'Content-Type': 'text/plain' });
    res.end('ok');
    return;
  }

  if (req.method !== 'POST' || req.url !== '/') {
    res.writeHead(404, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'not found' }));
    return;
  }

  let rawBody;
  try {
    rawBody = await readRawBody(req);
  } catch (err) {
    res.writeHead(413, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: err.message }));
    return;
  }

  const valid = verifySignature(
    process.env.SEND_EMAIL_HOOK_SECRET,
    req.headers['webhook-id'],
    req.headers['webhook-timestamp'],
    rawBody,
    req.headers['webhook-signature']
  );
  if (!valid) {
    console.log('mail-bridge: невалидная подпись вебхука, отклонено (401)');
    res.writeHead(401, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'invalid signature' }));
    return;
  }

  let payload;
  try {
    payload = JSON.parse(rawBody.toString('utf8'));
  } catch {
    res.writeHead(400, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'invalid json' }));
    return;
  }

  try {
    await handleSendEmail(payload);
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end('{}');
  } catch (err) {
    const type = payload?.email_data?.email_action_type || '?';
    console.error(`mail-bridge: отправка не удалась type=${type}: ${err.message}`);
    res.writeHead(500, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'send failed' }));
  }
});

server.listen(PORT, '0.0.0.0', () => {
  console.log(`mail-bridge: слушаю :${PORT}`);
});
