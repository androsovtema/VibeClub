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
