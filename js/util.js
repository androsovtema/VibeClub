/**
 * We Designerz — общие утилиты.
 * escapeHtml защищает от хранимого XSS при вставке пользовательского текста в innerHTML.
 * Где возможно, предпочитай textContent/createElement — escapeHtml нужен только когда
 * текст обязательно идёт через шаблонную строку innerHTML.
 */
export function escapeHtml(str) {
  return String(str).replace(/[&<>"']/g, (ch) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', '\'': '&#39;'
  }[ch]));
}

/**
 * true только для абсолютных http/https-ссылок — защита от javascript: и прочих схем
 * при вставке пользовательских URL в href.
 */
export function isHttpUrl(value) {
  try {
    const url = new URL(value);
    return url.protocol === 'http:' || url.protocol === 'https:';
  } catch {
    return false;
  }
}

/**
 * Дописывает https:// к ссылкам без протокола (ourwall.ru → https://ourwall.ru),
 * не трогая значения, где протокол уже есть.
 */
export function normalizeHttpUrl(value) {
  const trimmed = String(value).trim();
  if (!trimmed || /^https?:\/\//i.test(trimmed)) return trimmed;
  return `https://${trimmed}`;
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const PHONE_RE = /^\+?\d{7,15}$/;
const GITHUB_HANDLE_RE = /^[\w-]+$/;

export function isValidEmail(value) {
  return EMAIL_RE.test(String(value).trim());
}

/** Убирает пробелы/скобки/дефисы, оставляя ведущий + и цифры. */
export function normalizePhone(value) {
  return String(value).trim().replace(/(?!^\+)[^\d]/g, '');
}

export function isValidPhone(value) {
  return PHONE_RE.test(value);
}

/** github.com/ник или @ник → ник (без протокола, домена, @, слэшей). */
export function normalizeGithubHandle(value) {
  return String(value).trim()
    .replace(/^https?:\/\/(www\.)?github\.com\//i, '')
    .replace(/^@/, '')
    .replace(/\/+$/, '')
    .replace(/^\/+/, '');
}

export function isValidGithubHandle(value) {
  return GITHUB_HANDLE_RE.test(value);
}

const ASCII_RE = /^[\x20-\x7E]*$/;

/**
 * Ранняя клиентская проверка email (только печатаемый ASCII, без кириллицы) —
 * чтобы не гонять её в CAPTCHA/Auth за невнятной серверной ошибкой. Пароль эта
 * функция намеренно не проверяет: Unicode-пароль (в т.ч. существующий у старого
 * пользователя) должен доходить до Auth без клиентского гейта.
 */
export function isAsciiOnly(value) {
  return ASCII_RE.test(String(value));
}

/**
 * Textarea растёт под текст до max-height из CSS (60vh), дальше — внутренний
 * скролл (overflow-y: auto в CSS). Вызывать на input и сразу после программной
 * установки value (префилл edit-режима), т.к. input там не срабатывает.
 */
export function autoGrowTextarea(el) {
  el.style.height = 'auto';
  el.style.height = `${el.scrollHeight}px`;
}

/**
 * Блокировка скролла фона под оверлеями (модалка, мобильное меню) со счётчиком
 * вложенности — несколько оверлеев могут быть открыты одновременно, скролл
 * возвращается только когда закрыт последний. Ширина скроллбара компенсируется
 * padding-right, иначе контент дёргается при скрытии полосы прокрутки.
 * overflow:hidden не останавливает touch-скролл в iOS Safari, поэтому body
 * фиксируется (position:fixed) со смещением на текущий скролл; при
 * разблокировке позиция возвращается мгновенно (behavior:'instant', иначе
 * scroll-behavior:smooth из styles.css анимировал бы возврат).
 */
let scrollLockCount = 0;
let savedBodyPaddingRight = '';
let savedScrollY = 0;

export function lockScroll() {
  if (scrollLockCount === 0) {
    const scrollbarWidth = window.innerWidth - document.documentElement.clientWidth;
    savedBodyPaddingRight = document.body.style.paddingRight;
    savedScrollY = window.scrollY;
    if (scrollbarWidth > 0) {
      const currentPadding = parseFloat(getComputedStyle(document.body).paddingRight) || 0;
      document.body.style.paddingRight = `${currentPadding + scrollbarWidth}px`;
    }
    document.body.style.position = 'fixed';
    document.body.style.top = `-${savedScrollY}px`;
    document.body.style.left = '0';
    document.body.style.right = '0';
    document.body.style.width = '100%';
    document.body.style.overflow = 'hidden';
  }
  scrollLockCount++;
}

export function unlockScroll() {
  if (scrollLockCount === 0) return;
  scrollLockCount--;
  if (scrollLockCount === 0) {
    document.body.style.position = '';
    document.body.style.top = '';
    document.body.style.left = '';
    document.body.style.right = '';
    document.body.style.width = '';
    document.body.style.overflow = '';
    document.body.style.paddingRight = savedBodyPaddingRight;
    window.scrollTo({ top: savedScrollY, left: 0, behavior: 'instant' });
  }
}

/**
 * Ссылка «Назад»: если пришли изнутри сайта — history.back(), иначе (прямой
 * заход, внешний переход, новая вкладка) — обычный переход по href (fallback).
 */
export function wireBackLink(el) {
  el.addEventListener('click', (event) => {
    let cameFromSite = false;
    try {
      cameFromSite = document.referrer
        && new URL(document.referrer).origin === window.location.origin
        && window.history.length > 1;
    } catch {
      cameFromSite = false;
    }
    if (cameFromSite) {
      event.preventDefault();
      window.history.back();
    }
  });
}
