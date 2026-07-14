#!/usr/bin/env node
/**
 * We Designerz — генерация секретов для infra/.env (T-LOC).
 * JWT_SECRET + подписанные им ANON_KEY/SERVICE_ROLE_KEY — те же клеймы
 * (role/iss/exp), тот же алгоритм (HS256), что у официального
 * supabase/docker/utils/generate-keys.sh — токены совместимы с self-hosted
 * Kong/GoTrue/PostgREST один в один.
 *
 * Запуск (локально, на машине с Node — не нужно ставить Node на VPS):
 *   node infra/scripts/gen-keys.mjs                  — печатает пары KEY=value
 *   node infra/scripts/gen-keys.mjs --update-env      — плюс пишет в infra/.env
 *     (infra/.env должен уже существовать: cp infra/.env.example infra/.env)
 *
 * Проверка ANON_KEY/SERVICE_ROLE_KEY — вставить в jwt.io, декод должен
 * показать {"role":"anon"/"service_role","iss":"supabase",...}.
 */

import { randomBytes, createHmac } from 'node:crypto';
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const envPath = join(__dirname, '..', '.env');

function b64url(buf) {
  return buf.toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function signJwt(payload, secret) {
  const header = { alg: 'HS256', typ: 'JWT' };
  const h = b64url(Buffer.from(JSON.stringify(header)));
  const p = b64url(Buffer.from(JSON.stringify(payload)));
  const signature = b64url(createHmac('sha256', secret).update(`${h}.${p}`).digest());
  return `${h}.${p}.${signature}`;
}

const jwtSecret = randomBytes(30).toString('base64');
const iat = Math.floor(Date.now() / 1000);
const exp = iat + 5 * 365 * 24 * 3600; // 5 лет — как в официальном скрипте

const anonKey = signJwt({ role: 'anon', iss: 'supabase', iat, exp }, jwtSecret);
const serviceRoleKey = signJwt({ role: 'service_role', iss: 'supabase', iat, exp }, jwtSecret);

const secrets = {
  JWT_SECRET: jwtSecret,
  ANON_KEY: anonKey,
  SERVICE_ROLE_KEY: serviceRoleKey,
  POSTGRES_PASSWORD: randomBytes(16).toString('hex'),
  PG_META_CRYPTO_KEY: randomBytes(24).toString('base64'),
  S3_PROTOCOL_ACCESS_KEY_ID: randomBytes(16).toString('hex'),
  S3_PROTOCOL_ACCESS_KEY_SECRET: randomBytes(32).toString('hex'),
  UMAMI_DB_PASSWORD: randomBytes(16).toString('hex'),
  UMAMI_APP_SECRET: randomBytes(24).toString('base64'),
};

console.log('# Сгенерированные секреты — вставь в infra/.env\n');
for (const [key, value] of Object.entries(secrets)) {
  console.log(`${key}=${value}`);
}

if (process.argv.includes('--update-env')) {
  if (!existsSync(envPath)) {
    console.error('\n✗ infra/.env не найден. Сначала: cp infra/.env.example infra/.env');
    process.exit(2);
  }
  let env = readFileSync(envPath, 'utf8');
  for (const [key, value] of Object.entries(secrets)) {
    const re = new RegExp(`^${key}=.*$`, 'm');
    env = re.test(env) ? env.replace(re, `${key}=${value}`) : `${env}\n${key}=${value}`;
  }
  writeFileSync(envPath, env);
  console.log(`\n✓ Записано в ${envPath}`);
} else {
  console.log('\nЧтобы сразу записать в infra/.env: node infra/scripts/gen-keys.mjs --update-env');
}
