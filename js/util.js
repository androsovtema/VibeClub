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
 */
let scrollLockCount = 0;
let savedBodyPaddingRight = '';

export function lockScroll() {
  if (scrollLockCount === 0) {
    const scrollbarWidth = window.innerWidth - document.documentElement.clientWidth;
    savedBodyPaddingRight = document.body.style.paddingRight;
    document.body.style.overflow = 'hidden';
    if (scrollbarWidth > 0) {
      const currentPadding = parseFloat(getComputedStyle(document.body).paddingRight) || 0;
      document.body.style.paddingRight = `${currentPadding + scrollbarWidth}px`;
    }
  }
  scrollLockCount++;
}

export function unlockScroll() {
  if (scrollLockCount === 0) return;
  scrollLockCount--;
  if (scrollLockCount === 0) {
    document.body.style.overflow = '';
    document.body.style.paddingRight = savedBodyPaddingRight;
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
