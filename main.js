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

    burger.classList.toggle('open', isOpen);
    nav.classList.toggle('open', isOpen);
    header.classList.toggle('open', isOpen);
    document.body.classList.toggle('menu-open', isOpen);
    burger.setAttribute('aria-expanded', isOpen);
    document.body.style.overflow = isOpen ? 'hidden' : '';
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
     PROJECTS FILTER (Projects page)
     ==================== */
  const filterTags = document.querySelectorAll('.filter-tag');
  const projectCards = document.querySelectorAll('.project-card');

  if (filterTags.length > 0 && projectCards.length > 0) {
    // Add transition styles to project cards
    projectCards.forEach(card => {
      card.style.transition = 'opacity 0.3s ease, transform 0.3s ease';
    });

    filterTags.forEach(tag => {
      tag.addEventListener('click', () => {
        // Update active state
        filterTags.forEach(t => t.classList.remove('active'));
        tag.classList.add('active');

        const filter = tag.getAttribute('data-filter');
        if (!filter) return;

        // Filter projects
        projectCards.forEach(card => {
          const cardTags = card.getAttribute('data-tags');

          if (filter === 'all') {
            card.style.display = 'block';
            setTimeout(() => {
              card.style.opacity = '1';
              card.style.transform = 'translateY(0)';
            }, 50);
          } else if (cardTags && cardTags.includes(filter)) {
            card.style.display = 'block';
            setTimeout(() => {
              card.style.opacity = '1';
              card.style.transform = 'translateY(0)';
            }, 50);
          } else {
            card.style.opacity = '0';
            card.style.transform = 'translateY(20px)';
            setTimeout(() => {
              card.style.display = 'none';
            }, 300);
          }
        });
      });
    });
  }

  /* ====================
     HERO DEMO (главная) — живой промпт → собирающийся интерфейс
     ==================== */
  const heroPrompt = document.querySelector('[data-prompt]');
  const heroStatus = document.querySelector('[data-status]');
  const heroBlocks = document.querySelectorAll('[data-asm]');
  const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  if (heroPrompt && heroBlocks.length > 0) {
    const prompts = [
      'сделай лендинг кофейни с меню',
      'приложение-трекер привычек',
      'портфолио фотографа с галереей'
    ];

    const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

    if (reducedMotion) {
      heroPrompt.textContent = prompts[0];
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
          const prompt = prompts[i % prompts.length];
          heroBlocks.forEach((b) => {
            b.style.opacity = '0';
            b.style.transform = 'translateY(10px)';
          });
          heroPrompt.textContent = '';
          if (heroStatus) {
            heroStatus.classList.remove('is-ok');
            heroStatus.textContent = 'печатаю промпт…';
          }
          for (let c = 0; c < prompt.length; c++) {
            heroPrompt.textContent += prompt[c];
            await sleep(40);
          }
          await sleep(420);
          if (heroStatus) heroStatus.textContent = '● генерирую интерфейс…';
          await sleep(620);
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

  /* ====================
     ВИТРИНА СООБЩЕСТВА (главная) — карточки проектов + фильтр
     ==================== */
  const communityGrid = document.getElementById('community-grid');

  if (communityGrid) {
    const covers = {
      a: 'linear-gradient(135deg, oklch(0.34 0.13 250), oklch(0.24 0.07 295))',
      b: 'linear-gradient(135deg, oklch(0.36 0.14 320), oklch(0.26 0.08 350))',
      d: 'linear-gradient(135deg, oklch(0.40 0.13 145), oklch(0.26 0.07 200))',
      e: 'linear-gradient(135deg, oklch(0.42 0.13 60), oklch(0.28 0.09 30))',
      f: 'linear-gradient(135deg, oklch(0.36 0.13 280), oklch(0.25 0.08 320))',
      g: 'linear-gradient(135deg, oklch(0.34 0.12 210), oklch(0.24 0.07 260))'
    };

    // Заглушка на время T2 (реальная витрина будет тянуться из Supabase — см. js/projects.js)
    const communityProjects = [
      { title: 'Капля — трекер привычек', author: 'Марина К.', tools: ['Claude', 'React'], tag: 'Продуктивность', filterKey: 'prod', core: false, cover: covers.a, likes: 128, comments: 14 },
      { title: 'Зерно — сайт кофейни', author: 'We Designerz', tools: ['Claude', 'Astro'], tag: 'Бизнес', filterKey: 'biz', core: true, cover: covers.b, likes: 342, comments: 31 },
      { title: 'Прыг — мини-платформер', author: 'Денис О.', tools: ['Cursor', 'Phaser'], tag: 'Игры', filterKey: 'game', core: false, cover: covers.f, likes: 97, comments: 8 },
      { title: 'Муза — AI-дневник настроения', author: 'We Designerz', tools: ['Claude'], tag: 'Личное', filterKey: 'home', core: true, cover: covers.d, likes: 256, comments: 22 },
      { title: 'Флора — каталог растений', author: 'Алина Г.', tools: ['Claude', 'Next.js'], tag: 'Личное', filterKey: 'home', core: false, cover: covers.g, likes: 74, comments: 6 },
      { title: 'Сила — дашборд для зала', author: 'Олег П.', tools: ['Claude', 'Supabase'], tag: 'Бизнес', filterKey: 'biz', core: false, cover: covers.e, likes: 61, comments: 5 },
      { title: 'Свадьба Маши и Кирилла', author: 'Кирилл Р.', tools: ['v0', 'React'], tag: 'Творчество', filterKey: 'art', core: false, cover: covers.b, likes: 189, comments: 27 },
      { title: 'Репетитор-бот', author: 'We Designerz', tools: ['Claude', 'Telegram'], tag: 'Продуктивность', filterKey: 'prod', core: true, cover: covers.a, likes: 143, comments: 11 }
    ];

    communityGrid.innerHTML = communityProjects.map((p) => `
      <article class="community-card" data-tags="${p.filterKey}">
        <div class="community-cover" style="background:${p.cover}">
          <span class="community-cover-label">скриншот проекта</span>
        </div>
        <div class="community-body">
          <div>
            <h3 class="community-title">${p.title}</h3>
            <div class="community-author">
              ${p.core ? '<span class="community-core-mark" title="команда We Designerz">✦</span>' : ''}
              <span>${p.author}</span>
            </div>
          </div>
          <div class="community-tools">
            ${p.tools.map((tool) => `<span class="community-tool">${tool}</span>`).join('')}
          </div>
          <div class="community-footer">
            <span>♥ ${p.likes}</span>
            <span>💬 ${p.comments}</span>
            <span class="community-footer-tag">${p.tag}</span>
          </div>
        </div>
      </article>
    `).join('');

    const showcaseChips = document.querySelectorAll('.showcase-chips .filter-tag');
    const communityCards = communityGrid.querySelectorAll('.community-card');

    showcaseChips.forEach((chip) => {
      chip.addEventListener('click', () => {
        showcaseChips.forEach((c) => c.classList.remove('active'));
        chip.classList.add('active');

        const filter = chip.getAttribute('data-filter');
        communityCards.forEach((card) => {
          const show = filter === 'all' || card.getAttribute('data-tags') === filter;
          card.style.display = show ? '' : 'none';
        });
      });
    });
  }

  /* ====================
     СПИСОК УЧАСТНИКОВ (блок "Вступить")
     ==================== */
  const memberChips = document.getElementById('member-chips');
  if (memberChips) {
    const members = ['@tyoma', '@alina', '@andrey', '@marina_k', '@den_o', '@flora_girl', '@kirill_r', '@oleg_p', '@muse_day', '@nikita', '@vera_s', '@sol'];
    memberChips.innerHTML = members.map((m) => `<span class="member-chip">${m}</span>`).join('')
      + '<span class="member-chip member-chip-more">+1 236 ещё</span>';
  }

})();
