import assert from 'node:assert/strict';
import test from 'node:test';
import { createServer } from 'node:http';
import { once } from 'node:events';
import { createCaptchaBridge, requiresCaptcha } from './server.mjs';

async function listen(server) {
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  return `http://127.0.0.1:${server.address().port}`;
}

async function close(server) {
  server.close();
  server.closeAllConnections?.();
  await once(server, 'close');
}

async function readBody(req) {
  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  return Buffer.concat(chunks);
}

async function setup({ smartHandler, turnstileHandler, upstreamHandler, timeoutMs = 80 } = {}) {
  const calls = { smart: [], turnstile: [], upstream: [] };
  const smart = createServer(async (req, res) => {
    calls.smart.push(new URLSearchParams((await readBody(req)).toString()));
    if (smartHandler) return smartHandler(req, res);
    res.setHeader('content-type', 'application/json');
    res.end(JSON.stringify({ status: 'ok', host: 'wedesignerz.com' }));
  });
  const turnstile = createServer(async (req, res) => {
    calls.turnstile.push(new URLSearchParams((await readBody(req)).toString()));
    if (turnstileHandler) return turnstileHandler(req, res);
    res.setHeader('content-type', 'application/json');
    res.end(JSON.stringify({ success: true }));
  });
  const upstream = createServer(async (req, res) => {
    calls.upstream.push({ url: req.url, method: req.method, headers: req.headers, body: await readBody(req) });
    if (upstreamHandler) return upstreamHandler(req, res);
    res.setHeader('content-type', 'application/json');
    res.end(JSON.stringify({ upstream: 'ok' }));
  });
  const [smartUrl, turnstileUrl, upstreamUrl] = await Promise.all([listen(smart), listen(turnstile), listen(upstream)]);
  const bridge = createCaptchaBridge({
    env: {
      SMARTCAPTCHA_SERVER_KEY: 'smart-server-key',
      CAPTCHA_SECRET: 'turnstile-secret',
      AUTH_UPSTREAM_URL: upstreamUrl,
      SMARTCAPTCHA_ALLOWED_HOSTS: 'wedesignerz.com,localhost,localhost:8080',
      SMARTCAPTCHA_VERIFY_URL: `${smartUrl}/validate`,
      TURNSTILE_VERIFY_URL: `${turnstileUrl}/siteverify`,
      CAPTCHA_VERIFY_TIMEOUT_MS: String(timeoutMs)
    }
  });
  const bridgeUrl = await listen(bridge);
  return {
    bridgeUrl,
    calls,
    async close() {
      await Promise.all([close(bridge), close(smart), close(turnstile), close(upstream)]);
    }
  };
}

function post(url, body, contentType = 'application/json') {
  return fetch(url, {
    method: 'POST',
    headers: { 'content-type': contentType, 'x-forwarded-for': '203.0.113.7, 10.0.0.1' },
    body: typeof body === 'string' ? body : JSON.stringify(body)
  });
}

test('health is local and does not call providers or upstream', async () => {
  const fixture = await setup();
  try {
    const response = await fetch(`${fixture.bridgeUrl}/health`);
    assert.equal(response.status, 200);
    assert.equal(await response.text(), 'ok');
    assert.deepEqual(fixture.calls, { smart: [], turnstile: [], upstream: [] });
  } finally {
    await fixture.close();
  }
});

test('GoTrue v2.193.0 route matrix keeps refresh/session grants outside CAPTCHA', () => {
  for (const path of ['/signup', '/recover', '/resend', '/magiclink', '/otp', '/passkeys/authentication/options', '/sso', '/sso/']) {
    assert.equal(requiresCaptcha('POST', path), true, path);
  }
  assert.equal(requiresCaptcha('POST', '/token', 'password'), true);
  for (const grant of ['refresh_token', 'pkce', 'id_token']) {
    assert.equal(requiresCaptcha('POST', '/token', grant), false, grant);
  }
  assert.equal(requiresCaptcha('GET', '/signup'), false);
  assert.equal(requiresCaptcha('POST', '/user'), false);
  assert.equal(requiresCaptcha('POST', '/logout'), false);
});

test('protected request without a token is rejected before upstream', async () => {
  const fixture = await setup();
  try {
    const response = await post(`${fixture.bridgeUrl}/signup`, { email: 'member@example.test' });
    assert.equal(response.status, 400);
    assert.equal((await response.json()).error_code, 'captcha_failed');
    assert.equal(fixture.calls.upstream.length, 0);
  } finally {
    await fixture.close();
  }
});

test('password grant in the query string is protected', async () => {
  const fixture = await setup();
  try {
    const response = await post(`${fixture.bridgeUrl}/token?grant_type=password`, { email: 'member@example.test' });
    assert.equal(response.status, 400);
    assert.equal((await response.json()).error_code, 'captcha_failed');
    assert.equal(fixture.calls.upstream.length, 0);
  } finally {
    await fixture.close();
  }
});

test('smart envelope is verified only by Yandex and is stripped before verification', async () => {
  const fixture = await setup();
  try {
    const response = await post(`${fixture.bridgeUrl}/signup`, {
      gotrue_meta_security: { captcha_token: 'smart:smart-token-value' }
    });
    assert.equal(response.status, 200);
    assert.equal(fixture.calls.smart.length, 1);
    assert.equal(fixture.calls.smart[0].get('token'), 'smart-token-value');
    assert.equal(fixture.calls.smart[0].get('ip'), '203.0.113.7');
    assert.equal(fixture.calls.turnstile.length, 0);
    assert.equal(fixture.calls.upstream.length, 1);
  } finally {
    await fixture.close();
  }
});

test('legacy raw token is verified only by Turnstile', async () => {
  const fixture = await setup();
  try {
    const response = await post(
      `${fixture.bridgeUrl}/signup`,
      'gotrue_meta_security%5Bcaptcha_token%5D=legacy-token-value',
      'application/x-www-form-urlencoded'
    );
    assert.equal(response.status, 200);
    assert.equal(fixture.calls.smart.length, 0);
    assert.equal(fixture.calls.turnstile.length, 1);
    assert.equal(fixture.calls.turnstile[0].get('response'), 'legacy-token-value');
    assert.equal(fixture.calls.upstream.length, 1);
  } finally {
    await fixture.close();
  }
});

test('provider failure, host mismatch, malformed data, and timeout all fail closed', async (t) => {
  const cases = [
    {
      name: 'provider status failure',
      smartHandler: (_req, res) => { res.statusCode = 500; res.end('no'); }
    },
    {
      name: 'provider reports failed status',
      smartHandler: (_req, res) => { res.setHeader('content-type', 'application/json'); res.end(JSON.stringify({ status: 'failed' })); }
    },
    {
      name: 'host mismatch',
      smartHandler: (_req, res) => { res.setHeader('content-type', 'application/json'); res.end(JSON.stringify({ status: 'ok', host: 'other.example' })); }
    },
    {
      name: 'malformed JSON',
      smartHandler: (_req, res) => { res.setHeader('content-type', 'application/json'); res.end('{'); }
    },
    {
      name: 'timeout',
      smartHandler: (req, res) => { req.on('close', () => res.destroy()); }
    }
  ];
  for (const scenario of cases) {
    await t.test(scenario.name, async () => {
      const fixture = await setup({ ...scenario, timeoutMs: 100 });
      try {
        const response = await post(`${fixture.bridgeUrl}/signup`, {
          gotrue_meta_security: { captcha_token: 'smart:one-time-value' }
        });
        assert.equal(response.status, 400);
        assert.equal((await response.json()).error_code, 'captcha_failed');
        assert.equal(fixture.calls.upstream.length, 0);
      } finally {
        await fixture.close();
      }
    });
  }
});

test('unprotected routes and refresh grants bypass providers and proxy raw payload unchanged', async () => {
  const fixture = await setup();
  try {
    const raw = 'refresh_token=current-session-token';
    const response = await post(`${fixture.bridgeUrl}/token?grant_type=refresh_token&trace=1`, raw, 'application/x-www-form-urlencoded');
    assert.equal(response.status, 200);
    assert.equal(fixture.calls.smart.length, 0);
    assert.equal(fixture.calls.turnstile.length, 0);
    assert.equal(fixture.calls.upstream.length, 1);
    assert.equal(fixture.calls.upstream[0].url, '/token?grant_type=refresh_token&trace=1');
    assert.equal(fixture.calls.upstream[0].body.toString(), raw);
  } finally {
    await fixture.close();
  }
});

test('upstream status, body, headers, and multiple cookies are preserved', async () => {
  const fixture = await setup({
    upstreamHandler: (_req, res) => {
      res.statusCode = 418;
      res.setHeader('content-type', 'text/plain');
      res.setHeader('x-upstream-test', 'kept');
      res.setHeader('set-cookie', ['first=one; Path=/', 'second=two; Path=/']);
      res.end('upstream-body');
    }
  });
  try {
    const response = await fetch(`${fixture.bridgeUrl}/user`);
    assert.equal(response.status, 418);
    assert.equal(response.headers.get('x-upstream-test'), 'kept');
    assert.equal(await response.text(), 'upstream-body');
    assert.deepEqual(response.headers.getSetCookie(), ['first=one; Path=/', 'second=two; Path=/']);
  } finally {
    await fixture.close();
  }
});

test('body above 256 KiB is rejected without provider or upstream calls', async () => {
  const fixture = await setup();
  try {
    const response = await post(`${fixture.bridgeUrl}/signup`, 'x'.repeat(256 * 1024 + 1), 'application/json');
    assert.equal(response.status, 413);
    assert.equal(fixture.calls.smart.length, 0);
    assert.equal(fixture.calls.turnstile.length, 0);
    assert.equal(fixture.calls.upstream.length, 0);
  } finally {
    await fixture.close();
  }
});
