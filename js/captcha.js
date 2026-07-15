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
let widgetHost = null;
let activeChallenge = null;

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

function removeWidget() {
  if (widgetId !== null && window.turnstile?.remove) window.turnstile.remove(widgetId);
  widgetId = null;
  widgetHost?.remove();
  widgetHost = null;
}

async function requestToken() {
  await loadScript();

  // Turnstile-токены одноразовые. Новый виджет на каждую Auth-операцию
  // надёжнее reset уже использованного экземпляра и не оставляет iframe в DOM.
  removeWidget();
  widgetHost = document.createElement('div');
  widgetHost.className = 'captcha-host';
  document.body.appendChild(widgetHost);

  return new Promise((resolve, reject) => {
    let settled = false;
    let timer = null;

    const finish = (fn, value) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      removeWidget();
      fn(value);
    };

    widgetId = window.turnstile.render(widgetHost, {
      sitekey: SITE_KEY,
      execution: 'execute',
      appearance: 'interaction-only',
      callback: (token) => finish(resolve, token),
      'error-callback': () => {
        finish(reject, new Error('captcha_error'));
        return true;
      },
      'expired-callback': () => finish(reject, new Error('captcha_expired')),
      'timeout-callback': () => finish(reject, new Error('captcha_timeout'))
    });

    timer = setTimeout(() => finish(reject, new Error('captcha_timeout')), TIMEOUT_MS);
    try {
      window.turnstile.execute(widgetId);
    } catch (error) {
      finish(reject, error);
    }
  });
}

/**
 * Возвращает одноразовый captcha-токен. Кидает Error, если Turnstile не
 * загрузился (блокировщик/сеть) или челлендж не пройден — вызывающий код
 * показывает человеку понятное сообщение.
 */
export async function getCaptchaToken() {
  if (!activeChallenge) {
    activeChallenge = requestToken().finally(() => {
      activeChallenge = null;
    });
  }
  return activeChallenge;
}
