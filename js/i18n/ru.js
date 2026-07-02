/**
 * We Designerz — словарь UI-строк (RU).
 * Единый источник текстов: новые строки добавлять сюда, не хардкодить в HTML/JS.
 * См. docs/01-architecture.md (i18n-готовность).
 */
export const ru = {
  'auth.modal.title': 'We Designerz',
  'auth.tab.signin': 'Войти',
  'auth.tab.signup': 'Регистрация',
  'auth.field.name': 'Имя',
  'auth.field.name.placeholder': 'Как к тебе обращаться',
  'auth.field.email': 'Почта',
  'auth.field.email.placeholder': 'you@example.com',
  'auth.field.password': 'Пароль',
  'auth.field.password.placeholder': 'Минимум 6 символов',
  'auth.action.signin': 'Войти',
  'auth.action.signup': 'Зарегистрироваться',
  'auth.action.magiclink': 'Войти по ссылке на почту',
  'auth.action.magiclink.submit': 'Отправить ссылку',
  'auth.action.back': 'Назад',
  'auth.action.close': 'Закрыть',
  'auth.action.loading': 'Секунду…',
  'auth.success.signin': 'Готово — добро пожаловать в We Designerz ✦',
  'auth.success.signup': 'Готово — добро пожаловать в We Designerz ✦',
  'auth.success.signup_confirm': 'Почти готово — мы отправили письмо для подтверждения почты. Перейди по ссылке в письме, чтобы войти.',
  'auth.success.magiclink': 'Ссылка отправлена — проверь почту.',
  'auth.success.signout': 'Ты вышел. До скорого!',
  'auth.header.join': 'Вступить',
  'auth.header.signout': 'Выйти',

  'auth.error.generic': 'Что-то пошло не так. Попробуй ещё раз.',
  'auth.error.invalid_credentials': 'Неверная почта или пароль.',
  'auth.error.user_exists': 'Эта почта уже зарегистрирована. Попробуй войти.',
  'auth.error.weak_password': 'Пароль слишком короткий — минимум 6 символов.',
  'auth.error.invalid_email': 'Проверь адрес почты — что-то не так с форматом.',
  'auth.error.email_not_confirmed': 'Почта ещё не подтверждена — проверь письмо со ссылкой.',
  'auth.error.rate_limit': 'Слишком много попыток. Подожди немного и попробуй снова.',
  'auth.error.required_email': 'Укажи почту.',
  'auth.error.required_password': 'Укажи пароль.',
  'auth.error.required_name': 'Укажи имя.',

  'showcase.empty': 'Здесь пока пусто. Будь первым — добавь проект.',

  'submit.gate.text': 'Чтобы добавить проект, войди — это быстро.',
  'submit.gate.action': 'Войти',

  'submit.field.title': 'Название',
  'submit.field.title.placeholder': 'Как называется проект',
  'submit.field.description': 'Что это и как сделано',
  'submit.field.description.placeholder': 'Что за продукт и как ты его вайбкодил: каким ИИ пользовался, что было сложно',
  'submit.field.url': 'Ссылка на проект',
  'submit.field.url.placeholder': 'https://…',
  'submit.field.cover': 'Обложка',
  'submit.field.cover.hint': 'JPEG, PNG или WebP, до 3 МБ. Без обложки карточка получит фирменный градиент.',
  'submit.field.cover.remove': 'Убрать обложку',
  'submit.field.tags': 'Теги',
  'submit.field.tags.hint': 'Выбери минимум один',
  'submit.field.tools': 'Инструменты ИИ',
  'submit.field.tools.hint': 'Выбери минимум один или добавь свой',
  'submit.field.tools.custom.placeholder': 'свой вариант',
  'submit.field.tools.custom.add': 'Добавить',
  'submit.field.tools.custom.remove': 'Убрать',

  'submit.action.submit': 'Отправить на модерацию',
  'submit.action.submitting': 'Отправляем…',

  'submit.success.title': 'Готово!',
  'submit.success.text': 'Проверим и опубликуем. Загляни в чат, пока ждёшь.',
  'submit.success.chat': 'Чат сообщества',

  'submit.error.required_title': 'Укажи название.',
  'submit.error.max_title': 'Название слишком длинное — максимум 80 символов.',
  'submit.error.required_description': 'Расскажи, что это и как сделано.',
  'submit.error.required_url': 'Укажи ссылку на проект.',
  'submit.error.invalid_url': 'Ссылка должна начинаться с http:// или https://.',
  'submit.error.required_tags': 'Выбери хотя бы один тег.',
  'submit.error.required_tools': 'Выбери хотя бы один инструмент.',
  'submit.error.cover_type': 'Обложка должна быть JPEG, PNG или WebP.',
  'submit.error.cover_size': 'Обложка слишком тяжёлая — максимум 3 МБ.',
  'submit.error.upload': 'Не получилось загрузить обложку. Попробуй ещё раз.',
  'submit.error.insert': 'Не получилось отправить проект. Попробуй ещё раз.'
};

export function t(key) {
  return ru[key] ?? key;
}

const CODE_MAP = {
  invalid_credentials: 'auth.error.invalid_credentials',
  user_already_exists: 'auth.error.user_exists',
  weak_password: 'auth.error.weak_password',
  validation_failed: 'auth.error.invalid_email',
  email_not_confirmed: 'auth.error.email_not_confirmed',
  over_email_send_rate_limit: 'auth.error.rate_limit',
  over_request_rate_limit: 'auth.error.rate_limit'
};

const MESSAGE_MAP = [
  [/invalid login credentials/i, 'auth.error.invalid_credentials'],
  [/already registered/i, 'auth.error.user_exists'],
  [/password should be at least/i, 'auth.error.weak_password'],
  [/unable to validate email address/i, 'auth.error.invalid_email'],
  [/email not confirmed/i, 'auth.error.email_not_confirmed'],
  [/rate limit|after \d+ seconds/i, 'auth.error.rate_limit']
];

export function mapAuthError(error) {
  if (!error) return t('auth.error.generic');
  if (error.code && CODE_MAP[error.code]) return t(CODE_MAP[error.code]);
  const message = error.message || '';
  const found = MESSAGE_MAP.find(([re]) => re.test(message));
  return found ? t(found[1]) : t('auth.error.generic');
}
