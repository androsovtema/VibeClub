/**
 * We Designerz — Yandex SmartCaptcha (SEC-10, защита Auth от ботов).
 *
 * Auth-сценарии передают captchaToken на signup/signin/reset/magic-link, а
 * внутренний captcha-bridge проверяет его до GoTrue. Токен одноразовый — перед
 * каждым запросом виджет ресетится и выполняется заново.
 *
 * Режим: invisible — виджет невидим и показывает челлендж (шилд снизу справа)
 * только если SmartCaptcha реально засомневался в посетителе. Site key
 * публичный по дизайну (secret живёт на сервере, токен проверяет captcha-bridge).
 */

const SITE_KEY = 'ysc1_3IEnmBJ5FxKEBWM2bhCbKoyxliT6JggB1KvQkQDF4c168c4e';
const SCRIPT_URL = 'https://smartcaptcha.yandexcloud.net/captcha.js';
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
  if (widgetId !== null && window.smartCaptcha?.destroy) window.smartCaptcha.destroy(widgetId);
  widgetId = null;
  widgetHost?.remove();
  widgetHost = null;
}

async function requestToken() {
  await loadScript();

  // Токены одноразовые. Новый виджет на каждую Auth-операцию надёжнее
  // reset уже использованного экземпляра и не оставляет iframe в DOM.
  removeWidget();
  widgetHost = document.createElement('div');
  widgetHost.className = 'captcha-host';
  document.body.appendChild(widgetHost);

  return new Promise((resolve, reject) => {
    let settled = false;
    let timer = null;
    const unsubscribers = [];

    const finish = (fn, value) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      unsubscribers.forEach((unsubscribe) => unsubscribe());
      removeWidget();
      fn(value);
    };

    widgetId = window.smartCaptcha.render(widgetHost, {
      sitekey: SITE_KEY,
      invisible: true,
      hl: 'ru',
      shieldPosition: 'bottom-right',
      callback: (token) => finish(resolve, `smart:${token}`)
    });

    // Стартовый таймаут короткий, но пазл человек решает долго: как только
    // челлендж стал виден, таймаут отменяем — не обрубать решающего человека.
    timer = setTimeout(() => finish(reject, new Error('captcha_timeout')), TIMEOUT_MS);

    unsubscribers.push(
      window.smartCaptcha.subscribe(widgetId, 'challenge-visible', () => {
        clearTimeout(timer);
        timer = null;
      })
    );
    // Челлендж скрылся без полученного токена — человек закрыл его сам.
    // Если токен уже получен, finish уже settled и этот вызов — no-op.
    unsubscribers.push(
      window.smartCaptcha.subscribe(widgetId, 'challenge-hidden', () => {
        finish(reject, new Error('captcha_cancelled'));
      })
    );
    unsubscribers.push(
      window.smartCaptcha.subscribe(widgetId, 'token-expired', () => {
        finish(reject, new Error('captcha_expired'));
      })
    );
    unsubscribers.push(
      window.smartCaptcha.subscribe(widgetId, 'network-error', () => {
        finish(reject, new Error('captcha_error'));
      })
    );
    unsubscribers.push(
      window.smartCaptcha.subscribe(widgetId, 'javascript-error', () => {
        finish(reject, new Error('captcha_error'));
      })
    );

    try {
      window.smartCaptcha.execute(widgetId);
    } catch (error) {
      finish(reject, error);
    }
  });
}

/**
 * Возвращает одноразовый captcha-токен. Кидает Error, если SmartCaptcha не
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
