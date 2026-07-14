// Ставит класс .scrolled на шапку, если страница открыта уже прокрученной.
// Вынесено из инлайновых <script> ради строгого CSP без 'unsafe-inline' (SEC-06).
(function () {
  if (window.scrollY > 100) {
    document.querySelector('.header')?.classList.add('scrolled');
  }
})();
