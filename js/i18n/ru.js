/**
 * We Designerz — словарь UI-строк (RU).
 * Единый источник текстов: новые строки добавлять сюда, не хардкодить в HTML/JS.
 * См. docs/01-architecture.md (i18n-готовность).
 */
export const ru = {
  'hero.note': 'Вступил — значит свой: профиль, твои проекты в витрине, твоё имя среди участников. Болтаем — в чате.',

  'community.cta.note': 'Вступление — минута. Что показать первым — решаешь сам.',

  'auth.modal.title': 'We Designerz',
  'auth.modal.subtitle': 'Имя, почта — и ты свой. Выкладывай проекты, обсуждай чужие, обживайся. Как старый добрый форум, только код теперь пишет ИИ.',
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
  'auth.action.forgot': 'Забыл пароль?',
  'auth.action.back': 'Назад',
  'auth.action.close': 'Закрыть',
  'auth.action.loading': 'Секунду…',
  'auth.success.signin': 'С возвращением ✦',
  'auth.success.signup': 'Добро пожаловать в клуб ✦',
  'auth.success.magiclink': 'Ссылка отправлена — проверь почту.',
  'auth.success.signout': 'Ты вышел. До скорого!',
  'auth.success.email_confirmed': 'Почта подтверждена — ты в клубе ✦',
  'auth.success.password_updated': 'Пароль обновлён ✦',
  'auth.header.join': 'Вступить',
  'auth.header.signout': 'Выйти',
  'nav.join.member': 'Добавить проект',
  'nav.back': 'Назад',

  'auth.welcome.title': 'Ты в клубе',
  'auth.welcome.text': 'С первого проекта всё и начинается. Не жди, пока будет идеально, — тут никто не ждал.',
  'auth.welcome.step1': 'Покажи первый проект',
  'auth.welcome.step2': 'Загляни в чат — поздоровайся',

  'auth.confirm.title': 'Проверь почту',
  'auth.confirm.text.prefix': 'Письмо ушло на ',
  'auth.confirm.text.suffix.signup': '. Перейди по ссылке в письме — и ты в клубе.',
  'auth.confirm.text.suffix.reset': '. Перейди по ссылке в письме, чтобы задать новый пароль.',
  'auth.confirm.resend': 'Отправить письмо ещё раз',
  'auth.confirm.resend.cooldown': 'Отправить снова через {s} с',
  'auth.confirm.back.signup': 'Ввёл не ту почту? Назад к форме',
  'auth.confirm.back.reset': 'Назад к входу',

  'auth.forgot.submit': 'Восстановить пароль',

  'auth.reset.title': 'Новый пароль',
  'auth.reset.text': 'Придумай новый пароль для входа.',
  'auth.reset.field.password': 'Новый пароль',
  'auth.reset.field.password_confirm': 'Повтори пароль',
  'auth.reset.submit': 'Сохранить пароль',

  'auth.error.generic': 'Что-то пошло не так. Попробуй ещё раз.',
  'auth.error.invalid_credentials': 'Неверная почта или пароль.',
  'auth.error.user_exists': 'Эта почта уже зарегистрирована. Попробуй войти.',
  'auth.error.user_exists_signin': 'Эта почта уже в клубе. Войди — или восстанови пароль.',
  'auth.error.weak_password': 'Пароль слишком короткий — минимум 6 символов.',
  'auth.error.invalid_email': 'Проверь адрес почты — что-то не так с форматом.',
  'auth.error.email_not_confirmed': 'Почта ещё не подтверждена — проверь письмо со ссылкой.',
  'auth.error.rate_limit': 'Слишком часто. Подожди пару минут и попробуй снова.',
  'auth.error.password_mismatch': 'Пароли не совпадают.',
  'auth.error.same_password': 'Это твой текущий пароль. Придумай новый, отличный от старого.',
  'auth.error.required_email': 'Укажи почту.',
  'auth.error.required_password': 'Укажи пароль.',
  'auth.error.required_name': 'Укажи имя.',

  'showcase.empty': 'Тут пока тихо. Зайди первым — твой проект откроет ленту.',
  'showcase.kicker.text': 'покажи, что народ навайбкодил',
  'who.kicker.text': 'кто мы',

  'submit.gate.text': 'Проекты сюда добавляют свои. Вступи или войди — и вот что дальше:',
  'submit.gate.item1.title': 'Что заполнишь',
  'submit.gate.item1.text': 'Название, пара слов о том, как собирал, ссылка и обложка. Минуты две, честно.',
  'submit.gate.item2.title': 'Как публикуется',
  'submit.gate.item2.text': 'Мы читаем всё сами, без роботов. Проверим — и проект в витрине.',
  'submit.gate.item3.title': 'Зачем',
  'submit.gate.item3.text': 'Твоё увидят свои: спросят, подскажут, похвалят. Ради этого всё и затевалось.',
  'submit.gate.action': 'Вступить или войти',

  'submit.field.title': 'Название',
  'submit.field.title.placeholder': 'Как называется проект',
  'submit.field.description': 'Что это и как сделано',
  'submit.field.description.placeholder': 'Расскажи как есть: что придумал, чем вайбкодил, где застрял и как выкрутился',
  'submit.field.url': 'Ссылка на проект',
  'submit.field.url.placeholder': 'https://…',
  'submit.field.cover': 'Обложка',
  'submit.field.cover.choose': 'Выбрать файл',
  'submit.field.cover.filename_empty': 'Файл не выбран',
  'submit.field.cover.hint': 'JPEG, PNG или WebP, до 10 МБ — сожмём и сконвертируем сами. Горизонтальные или квадратные, лучше всего 16:9 — например, 1280×720.',
  'submit.field.cover.remove': 'Убрать обложку',
  'submit.field.images': 'Ещё изображения (до 9)',
  'submit.field.images.choose': 'Добавить файлы',
  'submit.field.images.hint': 'Необязательно. Тот же формат, что обложка — покажут проект с разных сторон. Горизонтальные или квадратные, лучше всего 16:9.',
  'submit.field.images.remove': 'Убрать изображение',
  'submit.field.tags': 'Теги',
  'submit.field.tags.hint': 'Выбери минимум один',
  'submit.field.tools': 'Инструменты ИИ',
  'submit.field.tools.hint': 'Выбери минимум один или добавь свой',
  'submit.field.tools.custom.placeholder': 'свой вариант',
  'submit.field.tools.custom.add': 'Добавить',
  'submit.field.tools.custom.remove': 'Убрать',

  // T12 — стадия и «что ищу» (оба поля необязательные)
  'submit.field.stage': 'На какой стадии?',
  'submit.field.stage.hint': 'Необязательно. Чтобы было понятно, куда проект дошёл.',
  'submit.field.looking': 'Чего не хватает?',
  'submit.field.looking.hint': 'Отметь — и в обсуждение придут те, кто может помочь. Необязательно.',

  // Словарь стадий (ключи в БД → подписи)
  'stage.idea': 'идея',
  'stage.prototype': 'прототип',
  'stage.mvp': 'MVP',
  'stage.users': 'есть пользователи',
  'stage.commercial': 'зарабатывает',

  // Словарь запросов «что ищу»
  'looking.feedback': 'фидбек',
  'looking.testers': 'тестеры',
  'looking.designer': 'дизайнер',
  'looking.developer': 'разработчик',
  'looking.cofounder': 'кофаундер',
  'looking.client': 'клиенты',
  'looking.investor': 'инвестиции',

  // Карточка витрины и страница проекта
  'card.looking.prefix': 'ищет',
  'project.looking.title': 'Автор ищет',

  // T13 — словарь категорий направленного фидбека в комменте
  'kind.ux': 'UX',
  'kind.idea': 'идея',
  'kind.bug': 'баг',
  'kind.market': 'рынок',
  'kind.contact': 'контакт',
  'kind.collab': 'коллаб',

  'submit.action.submit': 'Отправить на модерацию',
  'submit.action.submitting': 'Отправляем…',

  // Режим редактирования своего проекта (submit.html?id=…)
  'submit.edit.title': 'Редактировать проект',
  'submit.edit.doctitle': 'Редактировать проект — We Designerz',
  'submit.edit.action': 'Сохранить',
  'submit.edit.saving': 'Сохраняем…',
  'submit.edit.cover_hint': 'Обложка уже загружена. Выбери файл, только если хочешь заменить.',
  'submit.edit.load_error': 'Не удалось загрузить проект для редактирования.',
  'submit.edit.forbidden': 'Редактировать можно только свой проект.',
  'submit.edit.save_error': 'Не получилось сохранить. Попробуй ещё раз.',

  'submit.success.title': 'Улетело',
  'submit.success.text': 'Прочитаем и выпустим в витрину. А пока загляни в чат — там всегда есть о чём.',
  'submit.success.chat': 'Чат сообщества',
  'submit.success.again': 'Добавить ещё один',

  'submit.error.required_title': 'Укажи название.',
  'submit.error.max_title': 'Название слишком длинное — максимум 80 символов.',
  'submit.error.required_description': 'Расскажи, что это и как сделано.',
  'submit.error.required_url': 'Укажи ссылку на проект.',
  'submit.error.invalid_url': 'Ссылка должна начинаться с http:// или https://.',
  'submit.error.required_tags': 'Выбери хотя бы один тег.',
  'submit.error.required_tools': 'Выбери хотя бы один инструмент.',
  'submit.error.cover_type': 'Файл должен быть JPEG, PNG или WebP.',
  'submit.error.cover_size': 'Файл слишком тяжёлый — максимум 10 МБ.',
  'submit.error.orientation': 'Только горизонтальные или квадратные изображения — вертикалка режется в витрине.',
  'submit.error.required_cover': 'Добавь обложку — без неё проект не попадёт в витрину.',
  'submit.error.images_max': 'Максимум 9 дополнительных изображений.',
  'submit.error.upload': 'Не получилось загрузить обложку. Попробуй ещё раз.',
  'submit.error.insert': 'Не получилось отправить проект. Попробуй ещё раз.',

  'project.loading': 'Загрузка…',
  'project.notfound.title': 'Проект не найден',
  'project.notfound.text': 'Такого проекта не нашлось. Может, он ещё на модерации — или ссылка что-то напутала.',
  'project.notfound.link': 'Все проекты',
  'project.notfound.doctitle': 'Проект не найден — We Designerz',
  'project.action.open': 'Открыть проект →',
  'project.action.edit': 'Редактировать',
  'project.cover.label': 'скриншот проекта',

  'project.discussion.title': 'Обсуждение',
  'project.comments.empty': 'Пока тихо. Спроси автора, как он это собрал, — авторы такое любят.',
  'project.comment.gate.text': 'Спросить, подсказать, похвалить — после входа. Вступи или войди.',
  'project.comment.gate.action': 'Вступить или войти',
  // Подсказка над формой: общая или персональная (по первому looking_for автора)
  'project.comment.hint.default': 'Помоги автору: скажи про UX, идею, баг или рынок — конкретика дороже «круто».',
  'project.comment.hint.feedback': 'Автор просит фидбек — скажи как есть, это и нужно.',
  'project.comment.hint.testers': 'Автор ищет тестеров — попробуй и расскажи, что вышло.',
  'project.comment.hint.designer': 'Автор ищет дизайнера — если шаришь в UX, глянь и подскажи.',
  'project.comment.hint.developer': 'Автор ищет разработчика — если шаришь в коде, глянь и подскажи.',
  'project.comment.hint.cofounder': 'Автор ищет кофаундера — если откликается, напиши прямо тут.',
  'project.comment.hint.client': 'Автор ищет клиентов — знаешь кому предложить, шепни в комментах.',
  'project.comment.hint.investor': 'Автор ищет инвестиции — есть контакты или мысли, поделись.',

  'project.comment.placeholder': 'Спроси, подскажи, похвали — по-человечески',
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
  'profile.notfound.text': 'Такого участника не нашлось — может, ссылка что-то напутала.',
  'profile.notfound.link': 'Все проекты',
  'profile.notfound.doctitle': 'Профиль не найден — We Designerz',
  'profile.projects.title': 'Проекты участника',
  'profile.projects.empty': 'Пока без проектов — всё впереди.',
  'profile.edit.link': 'Редактировать профиль',

  // Словарь «открыт к…» (T14) — общий для me.html и profile.html
  'open_to.collab': 'открыт к коллабам',
  'open_to.orders': 'беру заказы',
  'open_to.team': 'ищу команду',

  'me.doctitle': 'Кабинет — We Designerz',
  'me.heading': 'Кабинет',
  'me.loading': 'Загрузка…',

  'me.gate.text': 'Здесь редактируешь профиль и следишь за судьбой своих проектов. Вступи или войди.',
  'me.gate.action': 'Вступить или войти',

  'me.field.name': 'Имя',
  'me.field.bio': 'О себе',
  'me.field.bio.placeholder': 'Пара слов о том, что делаешь',
  'me.field.telegram': 'Telegram',
  'me.field.telegram.placeholder': '@ник',
  'me.field.website': 'Сайт',
  'me.field.website.placeholder': 'https://…',
  'me.field.skills': 'Что умеешь',
  'me.field.skills.hint': 'До 10 тегов, свободный ввод. Enter или «Добавить».',
  'me.field.skills.placeholder': 'например, Figma',
  'me.field.skills.add': 'Добавить',
  'me.field.skills.remove': 'Убрать',
  'me.field.open_to': 'К чему открыт',
  'me.field.open_to.hint': 'Необязательно, можно выбрать несколько.',

  'me.action.save': 'Сохранить',
  'me.action.saving': 'Сохраняем…',
  'me.save.success': 'Сохранено ✦',
  'me.save.error': 'Не получилось сохранить. Попробуй ещё раз.',
  'me.error.skills_max': 'Не больше 10 тегов.',
  'me.error.skills_len': 'Тег слишком длинный — максимум 24 символа.',
  'me.error.website': 'Ссылка должна начинаться с http:// или https://.',

  'me.projects.title': 'Твои проекты',
  'me.projects.empty': 'Пока нет ни одного — самое время.',
  'me.projects.empty.link': 'Показать первый проект',
  'me.status.pending': 'на модерации',
  'me.status.published': 'в витрине',
  'me.status.rejected': 'отклонён',

  'me.public.link': 'Мой публичный профиль',

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
  'admin.error.generic': 'Не получилось выполнить действие. Попробуй ещё раз.',

  // T22 — «Нашли проблему?»
  'admin.tab.feedback': 'Обращения',
  'admin.feedback.empty': 'Обращений нет — тишина и покой',
  'admin.feedback.show_done': 'Показать обработанные',
  'admin.feedback.guest': 'Гость',
  'admin.feedback.contact.prefix': 'Связь:',
  'admin.action.done': 'Обработано',

  'feedback.footer.link': 'Нашли проблему?',
  'feedback.modal.title': 'Нашли проблему?',
  'feedback.modal.subtitle': 'Опиши как есть — разберёмся. Если что-то сломалось у гостя, это тоже сюда.',
  'feedback.field.message': 'Что случилось?',
  'feedback.field.message.placeholder': 'Расскажи по-человечески: что делал, что пошло не так',
  'feedback.field.contact': 'Как с тобой связаться? (необязательно)',
  'feedback.field.contact.placeholder': 'Почта, телеграм — как удобно',
  'feedback.action.submit': 'Отправить',
  'feedback.action.submitting': 'Отправляем…',
  'feedback.action.close': 'Закрыть',
  'feedback.success.title': 'Спасибо, разберёмся',
  'feedback.success.text': 'Прочитаем и, если нужно, ответим — если оставил контакт.',
  'feedback.action.again': 'Написать ещё',
  'feedback.error.required_message': 'Расскажи, что случилось — минимум пара слов.',
  'feedback.error.generic': 'Не получилось отправить. Попробуй ещё раз.',
  'feedback.cooldown': 'Отправить снова через {s} с'
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
  same_password: 'auth.error.same_password',
  over_email_send_rate_limit: 'auth.error.rate_limit',
  over_request_rate_limit: 'auth.error.rate_limit'
};

const MESSAGE_MAP = [
  [/invalid login credentials/i, 'auth.error.invalid_credentials'],
  [/already registered/i, 'auth.error.user_exists'],
  [/password should be at least/i, 'auth.error.weak_password'],
  [/unable to validate email address/i, 'auth.error.invalid_email'],
  [/email not confirmed/i, 'auth.error.email_not_confirmed'],
  [/different from the old password/i, 'auth.error.same_password'],
  [/rate limit|after \d+ seconds/i, 'auth.error.rate_limit']
];

export function mapAuthError(error) {
  if (!error) return t('auth.error.generic');
  if (error.code && CODE_MAP[error.code]) return t(CODE_MAP[error.code]);
  const message = error.message || '';
  const found = MESSAGE_MAP.find(([re]) => re.test(message));
  return found ? t(found[1]) : t('auth.error.generic');
}
