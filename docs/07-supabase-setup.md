# 07 — Supabase: текущая эксплуатация и архив первоначальной настройки

> **Актуально с 2026-07-15.** Старые шаги создания бесплатного Supabase Cloud
> во Франкфурте больше не выполнять: production работает на self-hosted
> Supabase `https://api.wedesignerz.com` на RU-VPS. Cloud-проект сохранён с
> выключенными регистрациями, но не является готовым rollback/failover.

## Где источник правды

- Архитектура и модель данных: `docs/01-architecture.md`.
- Каноническая схема чистой установки: `supabase/schema.sql`.
- Изменения живой схемы: идемпотентные файлы `supabase/migrations/*.sql`.
- VPS, backup/restore и аварийные правила: `infra/RUNBOOK.md`.
- Короткий порядок проверок: `docs/12-runbook.md`.
- Текущий security-статус: `docs/16-security-status.md`.

## Что Тёма делает руками

1. Не вставляет `service_role`, пароль БД, JWT и содержимое `.env` в чат,
   репозиторий или браузерный фронт.
2. После ревью новой migration применяет **только этот файл** к self-host БД по
   `docs/12-runbook.md`, затем перезагружает schema cache PostgREST.
3. Запускает `npm run check`, а для RLS/security-миграций —
   `WDZ_TEST_JWT='<access_token>' npm run security-check` обычным member JWT.
4. Перед изменениями, которые чистят/переписывают данные, делает отдельный
   backup и следует специальному live-промпту/runbook, а не импровизирует.

## Публичные и секретные значения

- `SUPABASE_URL` и `SUPABASE_ANON_KEY` в `js/config.js` публичны по дизайну;
  защита строится на RLS и database triggers.
- `SERVICE_ROLE_KEY`, `POSTGRES_PASSWORD`, JWT secret, Turnstile secret,
  Unisender token и S3 credentials — только в `.env` на VPS/менеджере паролей.
- Новые миграции применяются только к self-host production. Старый cloud не
  синхронизировать автоматически.

## Историческая справка

Первый MVP действительно создавался в Supabase Cloud через Dashboard. Эти шаги
закрыты T0 и T-CUTOVER и удалены из инструкции, чтобы новая сессия случайно не
создала ещё один EU-проект и не записала его ключи во фронт.
