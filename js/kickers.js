/**
 * We Designerz — печать терминальных кикеров (.showcase-kicker, .who-kicker) при доскролле.
 * Печатает один раз при первом появлении в вьюпорте; при prefers-reduced-motion — сразу полный текст.
 */
import { t } from './i18n/ru.js';

const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

function typeInto(el, text, speed) {
  return new Promise((resolve) => {
    let i = 0;
    el.textContent = '';
    (function tick() {
      if (i >= text.length) {
        resolve();
        return;
      }
      el.textContent += text[i];
      i += 1;
      setTimeout(tick, speed);
    })();
  });
}

function setupKicker(containerSelector, textKey, speed = 32) {
  const container = document.querySelector(containerSelector);
  const target = container?.querySelector('[data-type-target]');
  if (!container || !target) return;

  const text = t(textKey);

  if (reducedMotion) {
    target.textContent = text;
    return;
  }

  const observer = new IntersectionObserver((entries) => {
    entries.forEach((entry) => {
      if (!entry.isIntersecting) return;
      observer.unobserve(container);
      typeInto(target, text, speed);
    });
  }, { threshold: 0.5 });

  observer.observe(container);
}

setupKicker('.showcase-kicker', 'showcase.kicker.text');
setupKicker('.who-kicker', 'who.kicker.text');
