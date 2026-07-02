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
