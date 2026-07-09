/**
 * We Designerz — Main JavaScript
 * Общие функции для всех страниц
 */

/* global Audio */

(function () {
  'use strict';

  /* ====================
     BURGER MENU
     ==================== */
  const burger = document.getElementById('burger');
  const nav = document.querySelector('.nav');
  const header = document.querySelector('.header');
  const navLinks = document.querySelectorAll('.nav a, .nav button');

  function toggleMenu(isOpen) {
    if (!burger || !nav || !header) return;

    const wasOpen = nav.classList.contains('open');
    burger.classList.toggle('open', isOpen);
    nav.classList.toggle('open', isOpen);
    header.classList.toggle('open', isOpen);
    document.body.classList.toggle('menu-open', isOpen);
    burger.setAttribute('aria-expanded', isOpen);
    // Счётчик блокировки скролла живёт в util.js (ES-модуль, мост на window
    // через app.js) — main.js сам импортировать его не может.
    // Лок трогаем только при реальной смене состояния: pageshow из bfcache
    // зовёт toggleMenu(false) безусловно, и без гарда закрытое меню снимало
    // бы чужой лок (например, открытой модалки).
    if (isOpen && !wasOpen) window.wdzLockScroll?.();
    else if (!isOpen && wasOpen) window.wdzUnlockScroll?.();
  }

  function closeMenu() {
    toggleMenu(false);
  }

  if (burger && nav && header) {
    // Открытие/закрытие по клику на бургер
    burger.addEventListener('click', () => {
      const isOpen = !burger.classList.contains('open');
      toggleMenu(isOpen);
    });

    // Закрытие при клике на ссылку в меню
    navLinks.forEach(link => {
      link.addEventListener('click', closeMenu);
    });

    // Закрытие при клике вне меню
    document.addEventListener('click', (e) => {
      if (nav.classList.contains('open') &&
        !nav.contains(e.target) &&
        !burger.contains(e.target)) {
        closeMenu();
      }
    });

    // Закрытие по Escape
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && nav.classList.contains('open')) {
        closeMenu();
      }
    });
  }

  // bfcache возвращает страницу со снапшотом DOM как есть — если меню было
  // открыто перед переходом (системная «Назад»), снапшот приходит открытым.
  window.addEventListener('pageshow', (e) => {
    if (e.persisted) toggleMenu(false);
  });

  /* ====================
     LOGO SCROLL ANIMATION
     ==================== */
  let ticking = false;

  function handleScroll() {
    if (!header) return;

    const currentScroll = window.scrollY;

    // Добавляем/удаляем класс только если состояние изменилось
    const shouldBeScrolled = currentScroll > 100;
    const isScrolled = header.classList.contains('scrolled');

    if (shouldBeScrolled && !isScrolled) {
      header.classList.add('scrolled');
    } else if (!shouldBeScrolled && isScrolled) {
      header.classList.remove('scrolled');
    }

    ticking = false;
  }

  // Throttle для производительности
  window.addEventListener('scroll', () => {
    if (!ticking) {
      window.requestAnimationFrame(handleScroll);
      ticking = true;
    }
  }, { passive: true });

  /* ====================
     SMOOTH SCROLL
     ==================== */
  document.querySelectorAll('a[href^="#"]').forEach(anchor => {
    anchor.addEventListener('click', function (e) {
      const targetId = this.getAttribute('href');
      if (targetId === '#') return;

      const target = document.querySelector(targetId);
      if (target) {
        e.preventDefault();
        target.scrollIntoView({
          behavior: 'smooth',
          block: 'start'
        });
      }
    });
  });

  /* ====================
     DYNAMIC TEXT ANIMATION (Hero)
     ==================== */
  const words = document.querySelectorAll('.dynamic-text');

  if (words.length > 0) {
    let wordIndex = 0;

    function changeWord() {
      const currentWord = words[wordIndex];
      const nextIndex = (wordIndex + 1) % words.length;
      const nextWord = words[nextIndex];

      if (!currentWord || !nextWord) return;

      // Убираем текущее слово
      currentWord.classList.remove('active');
      currentWord.classList.add('exit');

      // Показываем новое слово
      nextWord.classList.remove('exit');
      nextWord.classList.add('active');

      // Очищаем класс exit после завершения анимации
      setTimeout(() => {
        currentWord.classList.remove('exit');
      }, 800);

      wordIndex = nextIndex;
    }

    // Запускаем смену слов каждые 2.5 секунды
    setInterval(changeWord, 2500);
  }

  /* ====================
     AUDIO PLAYERS (About page)
     ==================== */
  const audioBtns = document.querySelectorAll('.audio-btn');
  let currentAudio = null;
  let currentBtn = null;

  if (audioBtns.length > 0) {
    audioBtns.forEach(btn => {
      btn.addEventListener('click', () => {
        const audioSrc = btn.getAttribute('data-audio');

        if (!audioSrc) {
          console.warn('Audio button has no data-audio attribute:', btn);
          return;
        }

        // Если уже играет этот же аудио — ставим на паузу
        if (currentAudio && currentBtn === btn && !currentAudio.paused) {
          currentAudio.pause();
          btn.classList.remove('playing');
          btn.textContent = 'Послушать отзыв';
          return;
        }

        // Если играет другой аудио — останавливаем
        if (currentAudio) {
          currentAudio.pause();
          currentAudio.currentTime = 0;
          if (currentBtn) {
            currentBtn.classList.remove('playing');
            currentBtn.textContent = 'Послушать отзыв';
          }
        }

        // Создаём новое аудио с обработкой ошибок
        try {
          currentAudio = new Audio(audioSrc);
          currentBtn = btn;

          // Обработка успешного окончания
          currentAudio.addEventListener('ended', () => {
            btn.classList.remove('playing');
            btn.textContent = 'Послушать отзыв';
            currentAudio = null;
            currentBtn = null;
          });

          // Обработка ошибок загрузки
          currentAudio.addEventListener('error', (e) => {
            console.error('Audio loading error:', audioSrc, e);
            btn.classList.remove('playing');
            btn.textContent = 'Ошибка загрузки';
            currentAudio = null;
            currentBtn = null;

            // Возвращаем текст через 2 секунды
            setTimeout(() => {
              btn.textContent = 'Послушать отзыв';
            }, 2000);
          });

          // Пробуем воспроизвести
          const playPromise = currentAudio.play();

          if (playPromise !== undefined) {
            playPromise
              .then(() => {
                btn.classList.add('playing');
                btn.textContent = 'Пауза';
              })
              .catch(error => {
                console.error('Audio play error:', error);
                btn.classList.remove('playing');
                btn.textContent = 'Ошибка воспроизведения';
                currentAudio = null;
                currentBtn = null;

                setTimeout(() => {
                  btn.textContent = 'Послушать отзыв';
                }, 2000);
              });
          }
        } catch (error) {
          console.error('Audio creation error:', error);
          btn.textContent = 'Ошибка';
          setTimeout(() => {
            btn.textContent = 'Послушать отзыв';
          }, 2000);
        }
      });
    });
  }

  /* ====================
     TELEGRAM BUTTONS (Removed in favor of anchor tags)
     ==================== */

  /* ====================
     HERO DEMO (главная) — живой промпт → собирающийся интерфейс
     ==================== */
  const heroPrompt = document.querySelector('[data-prompt]');
  const heroStatus = document.querySelector('[data-status]');
  const heroBlocks = document.querySelectorAll('[data-asm]');
  const heroTitleEl = document.querySelector('.hero-demo-block-title');
  const heroMediaEls = document.querySelectorAll('.hero-demo-card-media');
  const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  if (heroPrompt && heroBlocks.length > 0) {
    /* main.js — не ES-модуль (общий скрипт без сборки для всех страниц),
       импортировать i18n/контент-модуль не может, поэтому фикстура пар
       «промпт → выдача» живёт прямо тут. */
    const heroDemoPairs = [
      { prompt: 'сделай лендинг кофейни с меню', icon: '☕', title: 'Кофейня «Зерно»',
        media: ['oklch(0.4 0.1 250 / 50%)', 'oklch(0.42 0.12 320 / 50%)'] },
      { prompt: 'приложение-трекер привычек', icon: '✅', title: 'Привыкун',
        media: ['oklch(0.4 0.12 150 / 50%)', 'oklch(0.45 0.1 200 / 50%)'] },
      { prompt: 'портфолио фотографа с галереей', icon: '📷', title: 'Кадр',
        media: ['oklch(0.38 0.08 260 / 50%)', 'oklch(0.44 0.14 300 / 50%)'] },
      { prompt: 'трекер расходов для семьи', icon: '💰', title: 'Копилка',
        media: ['oklch(0.42 0.1 100 / 50%)', 'oklch(0.4 0.08 140 / 50%)'] },
      { prompt: 'сайт для барбершопа с записью', icon: '💈', title: 'Стрижка №1',
        media: ['oklch(0.4 0.15 20 / 50%)', 'oklch(0.44 0.12 40 / 50%)'] },
      { prompt: 'приложение для заказа еды', icon: '🍔', title: 'Го-еда',
        media: ['oklch(0.42 0.16 30 / 50%)', 'oklch(0.4 0.1 60 / 50%)'] },
      { prompt: 'блог про путешествия с картой', icon: '🗺️', title: 'Дорожный',
        media: ['oklch(0.4 0.1 220 / 50%)', 'oklch(0.44 0.08 180 / 50%)'] },
      { prompt: 'магазин украшений ручной работы', icon: '💍', title: 'Самоцвет',
        media: ['oklch(0.42 0.1 340 / 50%)', 'oklch(0.4 0.12 300 / 50%)'] },
      { prompt: 'приложение для медитации', icon: '🧘', title: 'Тишина',
        media: ['oklch(0.4 0.06 260 / 50%)', 'oklch(0.44 0.08 240 / 50%)'] },
      { prompt: 'сайт репетитора по английскому', icon: '📚', title: 'Практис',
        media: ['oklch(0.4 0.1 210 / 50%)', 'oklch(0.42 0.12 250 / 50%)'] },
      { prompt: 'студия йоги с расписанием', icon: '🧘‍♀️', title: 'Асана',
        media: ['oklch(0.4 0.1 160 / 50%)', 'oklch(0.44 0.08 190 / 50%)'] },
      { prompt: 'доставка цветов онлайн', icon: '💐', title: 'Букет.ру',
        media: ['oklch(0.42 0.14 350 / 50%)', 'oklch(0.4 0.1 10 / 50%)'] },
      { prompt: 'платформа для фрилансеров', icon: '💼', title: 'Фриланс+',
        media: ['oklch(0.4 0.08 230 / 50%)', 'oklch(0.44 0.1 260 / 50%)'] },
      { prompt: 'приложение для выгула собак', icon: '🐕', title: 'ГавГулять',
        media: ['oklch(0.42 0.12 90 / 50%)', 'oklch(0.4 0.1 130 / 50%)'] }
    ];

    const shuffle = (arr) => {
      const a = arr.slice();
      for (let k = a.length - 1; k > 0; k--) {
        const j = Math.floor(Math.random() * (k + 1));
        [a[k], a[j]] = [a[j], a[k]];
      }
      return a;
    };

    const pairs = shuffle(heroDemoPairs);

    const applyHeroPair = (pair) => {
      if (heroTitleEl) {
        heroTitleEl.textContent = '';
        const iconEl = document.createElement('span');
        iconEl.className = 'hero-demo-block-icon';
        iconEl.setAttribute('aria-hidden', 'true');
        iconEl.textContent = pair.icon;
        heroTitleEl.appendChild(iconEl);
        heroTitleEl.appendChild(document.createTextNode(pair.title));
      }
      heroMediaEls.forEach((el, idx) => {
        if (pair.media[idx]) el.style.background = pair.media[idx];
      });
    };

    const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

    if (reducedMotion) {
      applyHeroPair(pairs[0]);
      heroPrompt.textContent = pairs[0].prompt;
      heroBlocks.forEach((b) => {
        b.style.opacity = '1';
        b.style.transform = 'none';
      });
      if (heroStatus) {
        heroStatus.textContent = '✓ готово';
        heroStatus.classList.add('is-ok');
      }
    } else {
      (async function runHeroDemo() {
        let i = 0;
        for (;;) {
          const pair = pairs[i % pairs.length];
          heroBlocks.forEach((b) => {
            b.style.opacity = '0';
            b.style.transform = 'translateY(10px)';
          });
          heroPrompt.textContent = '';
          if (heroStatus) {
            heroStatus.classList.remove('is-ok');
            heroStatus.textContent = 'печатаю промпт…';
          }
          for (let c = 0; c < pair.prompt.length; c++) {
            heroPrompt.textContent += pair.prompt[c];
            await sleep(40);
          }
          await sleep(420);
          if (heroStatus) heroStatus.textContent = '● генерирую интерфейс…';
          await sleep(620);
          applyHeroPair(pair);
          for (const b of heroBlocks) {
            b.style.opacity = '1';
            b.style.transform = 'translateY(0)';
            await sleep(170);
          }
          if (heroStatus) {
            heroStatus.classList.add('is-ok');
            heroStatus.textContent = '✓ готово';
          }
          await sleep(2600);
          for (let k = heroBlocks.length - 1; k >= 0; k--) {
            heroBlocks[k].style.opacity = '0';
            heroBlocks[k].style.transform = 'translateY(10px)';
            await sleep(80);
          }
          await sleep(320);
          i++;
        }
      })();
    }
  }

})();

/**
 * Каретка-хамелеон в полях ввода: цвет курсора идёт по циклу
 * электрик-градиента (синий → фиолет → пурпур → тёплый).
 * caret-color не анимируется через keyframes в Blink, поэтому цикл —
 * на таймере, синхронизированном с морганием системной каретки:
 * Blink/macOS мигают 500мс видима / 500мс скрыта (период 1000мс),
 * отсчёт заново от фокуса и каждого ввода. Цвет меняем на 750мс
 * после последнего сброса — в середине скрытой фазы, чтобы смена
 * никогда не была видна; каждое появление — уже новый цвет.
 */
(function () {
  'use strict';

  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;

  const root = document.documentElement;
  const tokens = getComputedStyle(root);
  const colors = [
    '--color-accent-blue',
    '--color-accent-violet',
    '--color-accent-purple',
    '--color-accent-warm',
  ]
    .map((name) => tokens.getPropertyValue(name).trim())
    .filter(Boolean);
  if (colors.length === 0) return;

  const BLINK_PERIOD = 1000;
  const HIDDEN_MID = 750;

  let i = 0;
  let delayTimer = null;
  let cycleTimer = null;
  root.style.setProperty('--caret-cycle-color', colors[0]);

  function advance() {
    i = (i + 1) % colors.length;
    root.style.setProperty('--caret-cycle-color', colors[i]);
  }

  /* Любое событие, сбрасывающее моргание каретки (фокус, ввод,
     перемещение курсора), перезапускает и наш отсчёт. Пока человек
     печатает, каретка сплошная — цвет в это время не трогаем. */
  function resync() {
    clearTimeout(delayTimer);
    clearInterval(cycleTimer);
    delayTimer = setTimeout(() => {
      advance();
      cycleTimer = setInterval(advance, BLINK_PERIOD);
    }, HIDDEN_MID);
  }

  ['focusin', 'input', 'keydown', 'pointerdown'].forEach((type) => {
    document.addEventListener(
      type,
      (event) => {
        const t = event.target;
        if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA')) resync();
      },
      true
    );
  });
})();
