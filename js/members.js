/**
 * We Designerz — живая сетка участников на главной (T-UX4, было marquee из T-D4).
 * Тянет реальные profiles из Supabase, рендерит 1-3 ряда чипов со смещением,
 * ряды едут по горизонтали в противоположных направлениях (бесшовный цикл).
 * Никаких выдуманных "+N ещё": пусто/ошибка — блок скрыт (паттерн js/stats.js).
 * Самолистание — только если ряд шире контейнера и без prefers-reduced-motion.
 */
import { supabase } from './supabase.js';
import { initialOf } from './projects.js';

const MEMBER_LIMIT = 36;
const PX_PER_SECOND = 34;
const MIN_DURATION_S = 18;
const ROW_STRIDE_PX = 50; // высота чипа (~40) + вертикальный gap (10)
const MIN_ROWS = 2;
const MAX_ROWS = 14;
const MAX_CHIPS_PER_ROW = 60; // страховка от бесконечного заполнения
const WIDTH_FILL_FACTOR = 1.4; // насколько перекрыть ширину контейнера (для бесшовной прокрутки)
const ROW_SPEED_FACTOR = [1, 1.35, 0.85, 1.15, 0.9, 1.25];

function renderChip(member) {
  const chip = document.createElement('a');
  chip.className = 'member-chip';
  chip.href = `profile.html?id=${encodeURIComponent(member.id)}`;

  const avatar = document.createElement('span');
  avatar.className = 'member-chip-avatar';
  if (member.avatar_url) {
    const img = document.createElement('img');
    img.src = member.avatar_url;
    img.alt = '';
    avatar.appendChild(img);
  } else {
    avatar.textContent = initialOf(member.display_name);
  }

  const name = document.createElement('span');
  name.textContent = member.display_name || 'Участник сообщества';

  chip.append(avatar, name);
  return chip;
}

function hideMembers(grid, label) {
  grid.hidden = true;
  if (label) label.hidden = true;
}

// Раскидывает участников по rowCount рядам. Если участников меньше, чем рядов —
// циклически повторяет, чтобы каждый ряд был непустым (даже при одном участнике).
// Сдвигает стартовый индекс на ряд, чтобы соседние ряды не начинались с одного ника.
function splitIntoRows(members, rowCount) {
  const rows = [];
  for (let r = 0; r < rowCount; r++) {
    const row = [];
    for (let i = 0; i < members.length; i++) {
      row.push(members[(i + r) % members.length]);
    }
    rows.push(row);
  }
  return rows;
}

// Повторяет base по кругу до minCount элементов. Один участник — заполняем
// повторами (пользователь этого хочет: залить блок капсулой с его ником).
function buildFilledList(base, minCount) {
  if (base.length === 0) return [];
  const list = [];
  let cursor = 0;
  while (list.length < minCount && list.length < MAX_CHIPS_PER_ROW) {
    list.push(base[cursor % base.length]);
    cursor++;
  }
  return list;
}

// Сколько рядов нужно, чтобы залить высоту панели. Не зависит от числа
// участников — мало людей заполняем повторами.
function rowCountFor(gridHeight) {
  if (!gridHeight) return 3;
  const fit = Math.round(gridHeight / ROW_STRIDE_PX);
  return Math.max(MIN_ROWS, Math.min(MAX_ROWS, fit));
}

async function initMembers() {
  const grid = document.querySelector('[data-member-grid]');
  const label = document.querySelector('[data-member-label]');
  if (!grid) return;

  const { data, error } = await supabase
    .from('profiles')
    .select('id, display_name, avatar_url')
    .order('created_at', { ascending: false })
    .limit(MEMBER_LIMIT);

  if (error) {
    console.error('members: failed to load', error);
    hideMembers(grid, label);
    return;
  }

  if (!data || data.length === 0) {
    hideMembers(grid, label);
    return;
  }

  const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const gridWidth = grid.clientWidth || 320;
  const targetWidth = gridWidth * WIDTH_FILL_FACTOR;
  const rows = splitIntoRows(data, rowCountFor(grid.clientHeight));

  rows.forEach((rowMembers, index) => {
    const rowEl = document.createElement('div');
    rowEl.className = 'member-row';
    if (index % 2 === 1) rowEl.classList.add('is-reverse');

    const track = document.createElement('div');
    track.className = 'member-row-track';
    rowEl.appendChild(track);
    grid.appendChild(rowEl);

    // Заполняем ряд по ширине: докладываем чипы, пока трек не перекроет контейнер.
    let cursor = 0;
    while (track.scrollWidth < targetWidth && cursor < MAX_CHIPS_PER_ROW) {
      track.appendChild(renderChip(rowMembers[cursor % rowMembers.length]));
      cursor++;
    }
    if (track.children.length === 0) {
      buildFilledList(rowMembers, 1).forEach((m) => track.appendChild(renderChip(m)));
    }

    const overflowing = track.scrollWidth > grid.clientWidth + 4;
    if (!reducedMotion && overflowing) {
      // Дублируем набор для бесшовной прокрутки (@keyframes уводит на -50%).
      const firstHalf = Array.from(track.children);
      firstHalf.forEach((node) => track.appendChild(node.cloneNode(true)));
      const duration = Math.max(
        MIN_DURATION_S,
        (track.scrollWidth / 2 / PX_PER_SECOND) / (ROW_SPEED_FACTOR[index % ROW_SPEED_FACTOR.length] || 1)
      );
      rowEl.style.setProperty('--row-duration', `${duration}s`);
      rowEl.classList.add('is-animating');
    }
  });
}

initMembers();
