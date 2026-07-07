/**
 * We Designerz — единый словарь значений «стадия» и «что ищу» (T12).
 * В БД хранятся только ключи (check-констрейнты в схеме), в UI — русские подписи
 * через i18n. Свободный ввод невозможен: значение не из словаря не рендерится.
 */
import { t } from './i18n/ru.js';

export const STAGE_KEYS = ['idea', 'prototype', 'mvp', 'users', 'commercial'];
export const LOOKING_KEYS = [
  'feedback', 'testers', 'designer', 'developer', 'cofounder', 'client', 'investor'
];

export function isStage(key) {
  return STAGE_KEYS.includes(key);
}

export function isLooking(key) {
  return LOOKING_KEYS.includes(key);
}

// Подпись стадии или null, если ключ мусорный (в UI просто не покажем).
export function stageLabel(key) {
  return isStage(key) ? t(`stage.${key}`) : null;
}

// Подпись запроса или null для мусорного ключа.
export function lookingLabel(key) {
  return isLooking(key) ? t(`looking.${key}`) : null;
}

// Отфильтрованный список валидных ключей запросов (мусор из БД отсекается).
export function validLooking(list) {
  return Array.isArray(list) ? list.filter(isLooking) : [];
}
