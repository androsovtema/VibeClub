/**
 * We Designerz — обёртка над Umami Cloud (T19).
 * UMAMI_WEBSITE_ID пуст ИЛИ hostname localhost/127.0.0.1 — скрипт не грузим,
 * track() пишет в консоль (так проверяем воронку локально). Никакого PII
 * в событиях: только имена событий и короткие enum-пропсы.
 */
import { UMAMI_WEBSITE_ID } from './config.js';

const IS_LOCAL = location.hostname === 'localhost' || location.hostname === '127.0.0.1';
let enabled = false;

export function initAnalytics() {
  if (!UMAMI_WEBSITE_ID || IS_LOCAL) return;
  const script = document.createElement('script');
  script.defer = true;
  script.src = 'https://cloud.umami.is/script.js';
  script.dataset.websiteId = UMAMI_WEBSITE_ID;
  document.head.appendChild(script);
  enabled = true;
}

export function track(event, props) {
  if (!enabled) {
    console.debug('[analytics]', event, props);
    return;
  }
  // Адблок мог зарезать скрипт или он ещё не догрузился — window.umami тогда
  // undefined. Тихий no-op, страница не должна падать никогда (приёмка T19).
  try {
    window.umami?.track(event, props);
  } catch {
    // no-op
  }
}
