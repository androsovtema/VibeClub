#!/usr/bin/env node
/**
 * Internal CAPTCHA gateway for GoTrue.
 *
 * Kong is the only public entry point. This service validates the browser
 * token before forwarding protected Auth requests to GoTrue, whose built-in
 * CAPTCHA validation is deliberately disabled while the bridge is active.
 */
import { createServer } from 'node:http';

const MAX_BODY_BYTES = 256 * 1024;
const DEFAULT_TIMEOUT_MS = 6000;
const HOP_BY_HOP_HEADERS = new Set([
  'connection', 'keep-alive', 'proxy-authenticate', 'proxy-authorization',
  'te', 'trailer', 'transfer-encoding', 'upgrade'
]);
const REQUIRED_ENV = [
  'SMARTCAPTCHA_SERVER_KEY',
  'CAPTCHA_SECRET',
  'AUTH_UPSTREAM_URL',
  'SMARTCAPTCHA_ALLOWED_HOSTS'
];

function requiredEnv(env) {
  return REQUIRED_ENV.filter((name) => !env[name]?.trim());
}

function parseForm(rawBody) {
  const form = new URLSearchParams(rawBody.toString('utf8'));
  const direct = form.get('gotrue_meta_security.captcha_token')
    ?? form.get('gotrue_meta_security[captcha_token]');
  if (direct !== null) return { captchaToken: direct, grantType: form.get('grant_type') };

  const nested = form.get('gotrue_meta_security');
  if (nested) {
    try {
      const value = JSON.parse(nested);
      return { captchaToken: value?.captcha_token, grantType: form.get('grant_type') };
    } catch {
      // A malformed nested value simply cannot supply a usable CAPTCHA token.
    }
  }
  return { captchaToken: undefined, grantType: form.get('grant_type') };
}

export function parseAuthBody(rawBody, contentType = '') {
  if (!rawBody.length) return { captchaToken: undefined, grantType: undefined };
  if (contentType.toLowerCase().includes('application/json')) {
    try {
      const value = JSON.parse(rawBody.toString('utf8'));
      return {
        captchaToken: value?.gotrue_meta_security?.captcha_token,
        grantType: value?.grant_type
      };
    } catch {
      return { captchaToken: undefined, grantType: undefined };
    }
  }
  if (contentType.toLowerCase().includes('application/x-www-form-urlencoded')) {
    return parseForm(rawBody);
  }
  return { captchaToken: undefined, grantType: undefined };
}

/** GoTrue v2.193.0 endpoints which require CAPTCHA for POST requests. */
export function requiresCaptcha(method, pathname, grantType) {
  if (method !== 'POST') return false;
  if (['/signup', '/recover', '/resend', '/magiclink', '/otp', '/passkeys/authentication/options'].includes(pathname)) {
    return true;
  }
  if (pathname === '/sso' || pathname === '/sso/') return true;
  if (pathname !== '/token') return false;
  return !['refresh_token', 'pkce', 'id_token'].includes(grantType);
}

function firstForwardedIp(headers) {
  const forwarded = headers['x-forwarded-for'];
  if (typeof forwarded === 'string' && forwarded.trim()) return forwarded.split(',')[0].trim();
  const realIp = headers['x-real-ip'];
  return typeof realIp === 'string' ? realIp.trim() : '';
}

async function readRawBody(req) {
  const chunks = [];
  let size = 0;
  for await (const chunk of req) {
    size += chunk.length;
    if (size > MAX_BODY_BYTES) {
      const error = new Error('payload_too_large');
      error.statusCode = 413;
      throw error;
    }
    chunks.push(chunk);
  }
  return Buffer.concat(chunks);
}

function providerFailure(res) {
  res.writeHead(400, { 'content-type': 'application/json', 'cache-control': 'no-store' });
  res.end(JSON.stringify({ code: 400, error_code: 'captcha_failed', msg: 'captcha verification process failed' }));
}

function hopByHopHeaderNames(headers) {
  const blocked = new Set(HOP_BY_HOP_HEADERS);
  const connection = typeof headers.get === 'function' ? headers.get('connection') : headers.connection;
  if (connection) {
    for (const name of String(connection).split(',')) blocked.add(name.trim().toLowerCase());
  }
  return blocked;
}

function requestHeaders(headers, bodyLength) {
  const forwarded = {};
  const blocked = hopByHopHeaderNames(headers);
  for (const [name, value] of Object.entries(headers)) {
    const lower = name.toLowerCase();
    if (blocked.has(lower) || lower === 'host' || lower === 'content-length' || value === undefined) continue;
    forwarded[name] = Array.isArray(value) ? value.join(', ') : value;
  }
  if (bodyLength > 0) forwarded['content-length'] = String(bodyLength);
  return forwarded;
}

function responseHeaders(headers) {
  const forwarded = {};
  const blocked = hopByHopHeaderNames(headers);
  for (const [name, value] of headers.entries()) {
    if (!blocked.has(name.toLowerCase()) && name.toLowerCase() !== 'content-length') {
      forwarded[name] = value;
    }
  }
  const setCookies = typeof headers.getSetCookie === 'function' ? headers.getSetCookie() : [];
  if (setCookies.length) forwarded['set-cookie'] = setCookies;
  return forwarded;
}

async function verifySmartCaptcha(token, ip, config, fetchImpl) {
  const body = new URLSearchParams({ secret: config.smartKey, token, ip });
  const response = await fetchImpl(config.smartUrl, {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body,
    signal: AbortSignal.timeout(config.timeoutMs)
  });
  if (response.status !== 200) return false;
  let data;
  try {
    data = await response.json();
  } catch {
    return false;
  }
  return data?.status === 'ok' && typeof data.host === 'string' && config.allowedHosts.has(data.host);
}

async function verifyTurnstile(token, ip, config, fetchImpl) {
  const body = new URLSearchParams({ secret: config.turnstileSecret, response: token, remoteip: ip });
  const response = await fetchImpl(config.turnstileUrl, {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body,
    signal: AbortSignal.timeout(config.timeoutMs)
  });
  if (response.status !== 200) return false;
  let data;
  try {
    data = await response.json();
  } catch {
    return false;
  }
  return data?.success === true;
}

function makeConfig(env) {
  const timeoutMs = Number(env.CAPTCHA_VERIFY_TIMEOUT_MS || DEFAULT_TIMEOUT_MS);
  return {
    smartKey: env.SMARTCAPTCHA_SERVER_KEY,
    turnstileSecret: env.CAPTCHA_SECRET,
    upstreamUrl: new URL(env.AUTH_UPSTREAM_URL),
    smartUrl: env.SMARTCAPTCHA_VERIFY_URL || 'https://smartcaptcha.cloud.yandex.ru/validate',
    turnstileUrl: env.TURNSTILE_VERIFY_URL || 'https://challenges.cloudflare.com/turnstile/v0/siteverify',
    allowedHosts: new Set(env.SMARTCAPTCHA_ALLOWED_HOSTS.split(',').map((host) => host.trim()).filter(Boolean)),
    timeoutMs: Number.isFinite(timeoutMs) && timeoutMs >= 100 && timeoutMs <= 30000 ? timeoutMs : DEFAULT_TIMEOUT_MS
  };
}

export function createCaptchaBridge({ env = process.env, fetchImpl = fetch } = {}) {
  const missing = requiredEnv(env);
  if (missing.length) throw new Error(`captcha-bridge: missing required env: ${missing.join(', ')}`);
  const config = makeConfig(env);

  return createServer(async (req, res) => {
    const requestUrl = new URL(req.url, 'http://captcha-bridge.internal');
    if (req.method === 'GET' && requestUrl.pathname === '/health') {
      res.writeHead(200, { 'content-type': 'text/plain' });
      res.end('ok');
      return;
    }

    let rawBody;
    try {
      rawBody = await readRawBody(req);
    } catch (error) {
      res.writeHead(error.statusCode || 400, { 'content-type': 'application/json' });
      res.end(JSON.stringify({ error: error.statusCode === 413 ? 'payload_too_large' : 'invalid_body' }));
      return;
    }

    const parsed = parseAuthBody(rawBody, req.headers['content-type']);
    const grantType = requestUrl.searchParams.get('grant_type') ?? parsed.grantType;
    if (requiresCaptcha(req.method, requestUrl.pathname, grantType)) {
      const token = parsed.captchaToken;
      if (typeof token !== 'string' || !token) {
        providerFailure(res);
        return;
      }

      const ip = firstForwardedIp(req.headers);
      let valid = false;
      try {
        valid = token.startsWith('smart:')
          ? await verifySmartCaptcha(token.slice('smart:'.length), ip, config, fetchImpl)
          : await verifyTurnstile(token, ip, config, fetchImpl);
      } catch {
        valid = false;
      }
      if (!valid) {
        providerFailure(res);
        return;
      }
    }

    const upstreamUrl = new URL(`${requestUrl.pathname}${requestUrl.search}`, config.upstreamUrl);
    try {
      const upstream = await fetchImpl(upstreamUrl, {
        method: req.method,
        headers: requestHeaders(req.headers, rawBody.length),
        body: rawBody.length ? rawBody : undefined,
        redirect: 'manual'
      });
      const body = Buffer.from(await upstream.arrayBuffer());
      const headers = responseHeaders(upstream.headers);
      headers['content-length'] = String(body.length);
      res.writeHead(upstream.status, headers);
      res.end(body);
    } catch {
      res.writeHead(502, { 'content-type': 'application/json' });
      res.end(JSON.stringify({ error: 'auth_upstream_unavailable' }));
    }
  });
}

if (process.argv[1] && new URL(`file://${process.argv[1]}`).href === import.meta.url) {
  try {
    const server = createCaptchaBridge();
    const port = Number(process.env.PORT || 9997);
    server.listen(port, '0.0.0.0');
  } catch (error) {
    console.error(error.message);
    process.exit(1);
  }
}
