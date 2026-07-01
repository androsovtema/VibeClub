# 07 — Создание проекта Supabase (шаги для Тёмы)

Твоя часть T0 — создать проект. Техническую настройку (SQL, RLS, Storage, авторизация)
делает Sonnet/ассистент. От тебя нужны в конце только два публичных значения.

## Почему ты делаешь это сам, а не Sonnet через браузер
Аккаунт, пароль БД и владение проектом — твои личные креды. Их не автоматизируем.
Сложная и «страшная» часть (схема + RLS-защита) — на стороне ИИ, там ты ничего не путаешь.

## Шаги

1. Открой [supabase.com](https://supabase.com) → **Start your project** → войди через GitHub
   или email (это твой аккаунт, на нём будет проект).
2. **New project**:
   - **Name:** `we-designerz`
   - **Database Password:** нажми **Generate**, скопируй и **сохрани в надёжном месте**
     (менеджер паролей). Он нужен для прямого доступа к БД; на сайте он НЕ используется.
   - **Region:** ближайший к аудитории (напр. `Central EU (Frankfurt)`).
   - **Plan:** Free.
   - Жми **Create new project**, подожди ~2 минуты пока поднимется.
3. Когда проект готов, зайди в **Project Settings → API** (или **Data API**). Там будут:
   - **Project URL** (вида `https://xxxx.supabase.co`)
   - **anon public** ключ (длинная строка, помечен `anon` / `public`)
   - **service_role** ключ — **НЕ трогай и никому не давай.** Только для сервера.

## Что прислать в чат ассистенту
Только эти два публичных значения:
```
Project URL: https://xxxx.supabase.co
anon public key: eyJ...
```
Их безопасно светить — вся защита строится на RLS (см. `01-architecture.md`). `service_role`
ключ и пароль БД оставь у себя.

## Что уже готово
- `supabase/schema.sql` — таблицы, триггеры, **RLS + все политики**, Storage-bucket `covers`.
- `js/config.js` — прописан API URL `https://gjwybdzpzqwiybjnhkzh.supabase.co` + anon-ключ.

## Что осталось сделать в дашборде (ты, ~3 мин)
1. **SQL Editor → New query** → вставь весь `supabase/schema.sql` → **Run**. Должно пройти
   без ошибок (Storage-bucket создаётся тем же скриптом).
2. **Authentication → Providers → Email**: включи. Для MVP — **почта+пароль**. Магик-линк
   работает через тот же Email-провайдер. Google/Телефон НЕ включаем (Google заблокирован
   в РФ; SMS — платно, позже).
3. **Authentication → URL Configuration**: добавь в **Redirect URLs** адреса сайта —
   `http://localhost:8080` (локально) и `https://wedesignerz.com` (прод). Нужно для магик-линка.
4. После своей первой регистрации на сайте — назначь себя админом (SQL Editor):
   `update public.profiles set role='admin' where id = (select id from auth.users where email='ТВОЯ_ПОЧТА');`

Google-авторизация и OAuth-креды в Google Cloud — НЕ нужны (убраны из плана).

## Проверка (критерии T0)
- SQL применился без ошибок.
- Аноним НЕ может вставить проект со `status='published'` и НЕ может писать в чужой профиль.
- Авторизованный может создать проект только с `author_id = свой uid` и `status='pending'`.
