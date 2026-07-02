/**
 * We Designerz — живая лента участников на главной (T-D4).
 * Тянет реальные profiles из Supabase, рендерит чипы (аватар + имя, ссылка на профиль).
 * Никаких выдуманных "+N ещё": пусто/ошибка — блок скрыт (паттерн js/stats.js).
 * Самолистание — только если ряд шире контейнера и без prefers-reduced-motion.
 */
import { supabase } from './supabase.js';
import { initialOf } from './projects.js';

const MEMBER_LIMIT = 24;
const PX_PER_SECOND = 40;
const MIN_DURATION_S = 18;

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

function hideMembers(wrap, label) {
  wrap.hidden = true;
  if (label) label.hidden = true;
}

async function initMembers() {
  const wrap = document.querySelector('[data-member-marquee]');
  const track = document.getElementById('member-chips');
  const label = document.querySelector('[data-member-label]');
  if (!wrap || !track) return;

  const { data, error } = await supabase
    .from('profiles')
    .select('id, display_name, avatar_url')
    .order('created_at', { ascending: false })
    .limit(MEMBER_LIMIT);

  if (error) {
    console.error('members: failed to load', error);
    hideMembers(wrap, label);
    return;
  }

  if (!data || data.length === 0) {
    hideMembers(wrap, label);
    return;
  }

  data.forEach((member) => track.appendChild(renderChip(member)));

  const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const overflowing = track.scrollWidth > wrap.clientWidth + 4;

  if (!reducedMotion && overflowing) {
    // Дублируем ряд для бесшовной прокрутки: transform едет на -50% ширины трека.
    data.forEach((member) => track.appendChild(renderChip(member)));
    const duration = Math.max(MIN_DURATION_S, track.scrollWidth / 2 / PX_PER_SECOND);
    wrap.style.setProperty('--member-marquee-duration', `${duration}s`);
    wrap.classList.add('is-animating');
  }
}

initMembers();
