/**
 * We Designerz — словарь UI-строк (RU).
 * Единый источник текстов: новые строки добавлять сюда, не хардкодить в HTML/JS.
 * См. docs/01-architecture.md (i18n-готовность).
 */
export const ru = {
  'hero.note': 'Профиль на сайте — чтобы публиковать проекты и получать фидбек. Общаемся — в Телеграм-чате.',

  'community.cta.note': 'Кнопка — профиль на сайте. Ссылка — общение в Телеграм-чате.',

  'auth.modal.title': 'We Designerz',
  'auth.modal.subtitle': 'Вступай в клуб вайбкодеров: профиль — твой членский билет. Публикуй проекты, получай фидбек, расти. Общаемся — в Телеграм-чате.',
  'auth.tab.signin': 'Войти',
  'auth.tab.signup': 'Вступить',
  'auth.field.name': 'Имя',
  'auth.field.name.placeholder': 'Как к тебе обращаться',
  'auth.field.email': 'Почта',
  'auth.field.email.placeholder': 'you@example.com',
  'auth.field.password': 'Пароль',
  'auth.field.password.placeholder': 'Минимум 6 символов',
  'auth.action.signin': 'Войти',
  'auth.action.signup': 'Вступить в клуб',
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
  'nav.join.member': 'Добавить проект',

  'auth.welcome.title': 'Ты в клубе ✦',
  'auth.welcome.step1': 'Добавь проект',
  'auth.welcome.step2': 'Зайди в чат',

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
  'showcase.kicker.text': 'покажи свежие проекты сообщества',
  'who.kicker.text': 'кто мы',

  'submit.gate.text': 'Чтобы добавить проект — вступи в клуб или войди. Вот что тебя ждёт:',
  'submit.gate.item1.title': 'Что заполнишь',
  'submit.gate.item1.text': 'Название, описание, ссылка, обложка, теги, инструменты — около 2 минут.',
  'submit.gate.item2.title': 'Как публикуется',
  'submit.gate.item2.text': 'Проекты проходят ручную модерацию — появится на витрине после проверки.',
  'submit.gate.item3.title': 'Зачем',
  'submit.gate.item3.text': 'Фидбек от сообщества, место в витрине и свой профиль автора.',
  'submit.gate.action': 'Вступить или войти',

  'submit.field.title': 'Название',
  'submit.field.title.placeholder': 'Как называется проект',
  'submit.field.description': 'Что это и как сделано',
  'submit.field.description.placeholder': 'Что за продукт и как ты его вайбкодил: каким ИИ пользовался, что было сложно',
  'submit.field.url': 'Ссылка на проект',
  'submit.field.url.placeholder': 'https://…',
  'submit.field.cover': 'Обложка',
  'submit.field.cover.choose': 'Выбрать файл',
  'submit.field.cover.filename_empty': 'Файл не выбран',
  'submit.field.cover.hint': 'JPEG, PNG или WebP, до 3 МБ. Лучше всего 16:9 — например, 1280×720.',
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
  'submit.success.again': 'Добавить ещё один',

  'submit.error.required_title': 'Укажи название.',
  'submit.error.max_title': 'Название слишком длинное — максимум 80 символов.',
  'submit.error.required_description': 'Расскажи, что это и как сделано.',
  'submit.error.required_url': 'Укажи ссылку на проект.',
  'submit.error.invalid_url': 'Ссылка должна начинаться с http:// или https://.',
  'submit.error.required_tags': 'Выбери хотя бы один тег.',
  'submit.error.required_tools': 'Выбери хотя бы один инструмент.',
  'submit.error.cover_type': 'Обложка должна быть JPEG, PNG или WebP.',
  'submit.error.cover_size': 'Обложка слишком тяжёлая — максимум 3 МБ.',
  'submit.error.required_cover': 'Добавь обложку — без неё проект не попадёт в витрину.',
  'submit.error.upload': 'Не получилось загрузить обложку. Попробуй ещё раз.',
  'submit.error.insert': 'Не получилось отправить проект. Попробуй ещё раз.',

  'project.loading': 'Загрузка…',
  'project.notfound.title': 'Проект не найден',
  'project.notfound.text': 'Такого проекта нет — возможно, его ещё не опубликовали или ссылка неверна.',
  'project.notfound.link': 'Все проекты',
  'project.notfound.doctitle': 'Проект не найден — We Designerz',
  'project.action.open': 'Открыть проект →',
  'project.cover.label': 'скриншот проекта',

  'project.discussion.title': 'Обсуждение',
  'project.comments.empty': 'Сообщений пока нет. Напиши первым.',
  'project.comment.gate.text': 'Вступи или войди, чтобы оставить сообщение.',
  'project.comment.gate.action': 'Вступить или войти',
  'project.comment.placeholder': 'Твоё сообщение',
  'project.comment.submit': 'Отправить',
  'project.comment.submitting': 'Отправляем…',
  'project.comment.error': 'Сообщение не отправилось. Попробуй ещё раз.',
  'project.comment.edit': 'Изменить',
  'project.comment.delete': 'Удалить',
  'project.comment.save': 'Сохранить',
  'project.comment.cancel': 'Отмена',
  'project.comment.delete.confirm': 'Удалить?',
  'project.comment.delete.yes': 'Да',
  'project.comment.delete.cancel': 'Отмена',
  'project.comment.edit.error': 'Не получилось сохранить. Попробуй ещё раз.',
  'project.comment.delete.error': 'Не получилось удалить. Попробуй ещё раз.',

  'project.upvote.error': 'Не получилось. Попробуй ещё раз.',

  'profile.loading': 'Загрузка…',
  'profile.notfound.title': 'Профиль не найден',
  'profile.notfound.text': 'Такого участника нет — возможно, ссылка неверна.',
  'profile.notfound.link': 'Все проекты',
  'profile.notfound.doctitle': 'Профиль не найден — We Designerz',
  'profile.projects.title': 'Проекты участника',
  'profile.projects.empty': 'Пока без проектов',

  'activity.toast.added': 'добавил проект',

  'admin.loading': 'Загрузка…',
  'admin.doctitle': 'Модерация — We Designerz',
  'admin.title': 'Модерация',
  'admin.denied.doctitle': 'Доступа нет — We Designerz',
  'admin.denied.title': 'Доступа нет',
  'admin.denied.text': 'Эта страница только для команды модерации We Designerz.',
  'admin.denied.link': 'На главную',

  'admin.tab.pending': 'На модерации',
  'admin.tab.published': 'Опубликованные',
  'admin.tab.rejected': 'Отклонённые',
  'admin.tab.comments': 'Комментарии',

  'admin.pending.empty': 'Пока пусто — новых проектов на модерации нет.',
  'admin.published.empty': 'Пока пусто — опубликованных проектов нет.',
  'admin.rejected.empty': 'Пока пусто — отклонённых проектов нет.',
  'admin.comments.empty': 'Пока пусто — комментариев нет.',

  'admin.card.open': 'Открыть проект →',

  'admin.action.publish': 'Опубликовать',
  'admin.action.reject': 'Отклонить',
  'admin.action.reject.confirm': 'Точно отклонить?',
  'admin.action.unpublish': 'Снять с публикации',
  'admin.action.restore': 'Вернуть на модерацию',
  'admin.action.hide': 'Скрыть',
  'admin.action.hide.confirm': 'Точно скрыть?',
  'admin.action.yes': 'Да',
  'admin.action.cancel': 'Отмена',

  'admin.iscore.label': 'Флагман We Designerz',
  'admin.comment.project.prefix': 'Проект:',
  'admin.error.generic': 'Не получилось выполнить действие. Попробуй ещё раз.'
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
