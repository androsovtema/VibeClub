/**
 * We Designerz — Cloudflare Turnstile (SEC-10, защита Auth от ботов).
 *
 * Supabase Auth с включённым CAPTCHA protection требует captchaToken на signup/
 * signin/reset/magic-link. Токен одноразовый — перед каждым запросом виджет
 * ресетится и выполняется заново.
 *
 * Режим: execution='execute' + appearance='interaction-only' — виджет невидим и
 * показывает челлендж только если Cloudflare реально засомневался в посетителе.
 * Site key публичный по дизайну (secret живёт в настройках Supabase).
 */

const SITE_KEY = '0x4AAAAAAD1s8mvl49yX42qW';
const SCRIPT_URL = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit';
const TIMEOUT_MS = 30000;

let scriptPromise = null;
let widgetId = null;
let pending = null;

function loadScript() {
  if (scriptPromise) return scriptPromise;
  scriptPromise = new Promise((resolve, reject) => {
    const script = document.createElement('script');
    script.src = SCRIPT_URL;
    script.async = true;
    script.defer = true;
    script.onload = () => resolve();
    script.onerror = () => {
      scriptPromise = null;
      reject(new Error('captcha_script_failed'));
    };
    document.head.appendChild(script);
  });
  return scriptPromise;
}

function settle(fn, value) {
  const p = pending;
  pending = null;
  if (p) p[fn](value);
}

async function ensureWidget() {
  await loadScript();
  if (widgetId !== null) return;

  const host = document.createElement('div');
  host.className = 'captcha-host';
  document.body.appendChild(host);

  widgetId = window.turnstile.render(host, {
    sitekey: SITE_KEY,
    execution: 'execute',
    appearance: 'interaction-only',
    callback: (token) => settle('resolve', token),
    'error-callback': () => settle('reject', new Error('captcha_error')),
    'timeout-callback': () => settle('reject', new Error('captcha_timeout'))
  });
}

/**
 * Возвращает одноразовый captcha-токен. Кидает Error, если Turnstile не
 * загрузился (блокировщик/сеть) или челлендж не пройден — вызывающий код
 * показывает человеку понятное сообщение.
 */
export async function getCaptchaToken() {
  await ensureWidget();

  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => settle('reject', new Error('captcha_timeout')), TIMEOUT_MS);
    const done = (fn) => (value) => { clearTimeout(timer); fn(value); };
    pending = { resolve: done(resolve), reject: done(reject) };

    window.turnstile.reset(widgetId);
    window.turnstile.execute(widgetId);
  });
}
