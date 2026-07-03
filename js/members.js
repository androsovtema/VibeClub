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
const FILL_MIN_CHIPS = 6;
const ROW_SPEED_FACTOR = [1, 1.35, 0.85];

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

function splitIntoRows(members, rowCount) {
  const rows = Array.from({ length: rowCount }, () => []);
  members.forEach((member, i) => rows[i % rowCount].push(member));
  return rows.filter((row) => row.length > 0);
}

// Повторяет base по кругу до minCount элементов, не давая одинаковому нику
// оказаться рядом с самим собой (кроме случая, когда участник ровно один).
function buildFilledList(base, minCount) {
  if (base.length === 0) return [];
  if (base.length === 1) return [base[0]];

  const list = [...base];
  let cursor = 0;
  while (list.length < minCount) {
    const candidate = base[cursor % base.length];
    if (candidate.id !== list[list.length - 1].id) {
      list.push(candidate);
    }
    cursor++;
    if (cursor > minCount * 4) break; // защита от зацикливания
  }
  return list;
}

function rowCountFor(total) {
  if (total >= 8) return 3;
  if (total >= 4) return 2;
  return 1;
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
  const rows = splitIntoRows(data, rowCountFor(data.length));

  rows.forEach((rowMembers, index) => {
    const rowEl = document.createElement('div');
    rowEl.className = 'member-row';
    if (index % 2 === 1) rowEl.classList.add('is-reverse');

    const track = document.createElement('div');
    track.className = 'member-row-track';

    const displayList = buildFilledList(rowMembers, FILL_MIN_CHIPS);
    displayList.forEach((member) => track.appendChild(renderChip(member)));
    rowEl.appendChild(track);
    grid.appendChild(rowEl);

    const overflowing = track.scrollWidth > grid.clientWidth + 4;
    if (!reducedMotion && overflowing && displayList.length > 1) {
      displayList.forEach((member) => track.appendChild(renderChip(member)));
      const duration = Math.max(
        MIN_DURATION_S,
        (track.scrollWidth / 2 / PX_PER_SECOND) / (ROW_SPEED_FACTOR[index] || 1)
      );
      rowEl.style.setProperty('--row-duration', `${duration}s`);
      rowEl.classList.add('is-animating');
    }
  });
}

initMembers();
