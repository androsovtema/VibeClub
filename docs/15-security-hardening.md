# 15 — Аудит безопасности RU-VPS (2026-07-14)

Аудит self-hosted бэкенда (T-LOC) после подъёма. Слои: VPS → Docker → Kong/TLS
→ БД/RLS → Umami. Ниже — что нашли, что исправили, что осталось на Тёме.

> ⚠️ **ПОПРАВКА от 2026-07-14 (повторный аудит).** Утверждение ниже про
> «SSH: вход только по ключу, пароль отвергается» — **неверно**. Итоговая
> конфигурация `sshd -T` возвращает **`PasswordAuthentication yes`**:
> `50-cloud-init.conf` задаёт значение раньше `99-hardening.conf`, а OpenSSH
> применяет **первое** встреченное. Проверка «пароль отвергается» тогда прошла
> только потому, что root — единственный shell-аккаунт, а для него действует
> `PermitRootLogin prohibit-password`. Защита хрупкая: любой добавленный
> пользователь с паролем сразу окажется под брутфорсом.
> Статус и план исправления — `16-security-status.md` (SEC-09).
> **Проверять только через `sshd -T`, а не чтением конфигов.**
>
> ✅ **ИСПРАВЛЕНО 2026-07-14 (вечерняя сессия).** Добавлен
> `/etc/ssh/sshd_config.d/00-hardening.conf` (сортируется раньше
> `50-cloud-init.conf`, поэтому его значения выигрывают): `PasswordAuthentication no`,
> `PermitRootLogin prohibit-password`, `KbdInteractiveAuthentication no`.
> Проверено через `sshd -T` → `passwordauthentication no`; новая сессия по ключу
> работает. Установлен и запущен **fail2ban** (jail `sshd`, backend systemd,
> 5 попыток / 10 мин → бан на час) — первый IP забанен в первые же минуты.

## Критичное — исправлено сразу

- **Umami: дефолтный логин `admin`/`umami` пускал кого угодно.** `stats.wedesignerz.com`
  торчит в интернет, логин под дефолтом отдавал полный доступ к аналитике и
  настройкам. Пароль сменён на случайный (24 симв.), лежит в менеджере паролей
  Тёмы. Проверено: старый пароль → 401, новый → 200. **Дефолт в RUNBOOK шага 8
  убран.**
- **SSH изначально пускал по паролю.** `sshd` имел
  `PasswordAuthentication yes` и `PermitRootLogin yes` — открыто для брутфорса.
  Первая попытка с `99-hardening.conf` была перекрыта cloud-init; итоговый фикс —
  `/etc/ssh/sshd_config.d/00-hardening.conf`:
  `PasswordAuthentication no`, `PermitRootLogin prohibit-password`,
  `KbdInteractiveAuthentication no`. Вход только по ключу, проверено через
  `sshd -T`. Fail2ban установлен и работает.
- **`/root/vibeclub/.env` был `644`** (читаем любым пользователем на хосте).
  Права исправлены на `600`.

## Улучшения — сделано

- **HSTS + security-заголовки** добавлены в Caddy для обоих доменов:
  `Strict-Transport-Security` (1 год, includeSubDomains), `X-Content-Type-Options:
  nosniff`, `X-Frame-Options: DENY`, `Referrer-Policy`. Заголовок `Server` Caddy
  скрыт. Проверено `curl -I`.

## Проверено — уже было в порядке

- **ufw**: наружу только 22/80/443. Порты Zabbix-агента (10050), Postgres,
  Kong-admin, postgres-meta (8080), внутренние порты контейнеров — с интернета
  недоступны (проверено `nc` снаружи). Docker публикует только Caddy.
- **RLS на self-host проверен**: финальный `scripts/security-check.mjs` дал
  8/8 зелёных проверок в cutover; baseline и полный e2e зафиксированы в
  `docs/reports/T-CUTOVER-02-freeze-report.md`.
- **Анонимный доступ к данным**: `feedback` закрыт, `pending`-проекты не видны,
  `profiles` отдаёт публичный профиль. Отдельное доказуемое согласие на
  распространение контактов ещё закрывает T-CONSENT; до него это известный
  legal-gap, а не окончательно закрытая модель.
- **Storage**: анонимная и member-запись в бакет `covers` отбита (400), бакет
  Timeweb S3 с бэкапами — приватный (аноним → 403).
- **TLS**: 1.0/1.1 отключены, 1.2/1.3 работают, HTTP→HTTPS редирект (308),
  сертификаты Let's Encrypt валидны.
- **GoTrue**: неверные логины → 400, анонимная регистрация в Umami закрыта (404).
- **Авто-обновления**: `unattended-upgrades` включён (security-патчи ставятся
  сами).

## Почта — send-email hook (T-LOC-MAIL, 2026-07-14)

SMTP-порты Unisender Go недоступны с VPS (см. `infra/RUNBOOK.md`, шаг 6) —
письма идут через GoTrue send-email hook на внутренний сервис `mail-bridge`,
который шлёт через Web API Unisender. Секрет подписи вебхука
(`SEND_EMAIL_HOOK_SECRET`, standard-webhooks HMAC) — ещё один секрет, живёт
только в `/root/vibeclub/.env` на сервере (локально генерируется через
`infra/scripts/gen-keys.mjs`, как и
остальные), в репозитории — пусто. `mail-bridge` наружу не публикуется —
сидит в сетевом неймспейсе `auth` (`network_mode: service:auth`), доступа с
хоста или из интернета нет вообще; невалидная подпись вебхука отбивается 401
(проверено живьём).

**Найдено при живом тесте:** аккаунт Unisender Go на тарифе `free_tier`
шлёт письма только на заранее «проверенные» адреса/домены.
✅ **Закрыто 2026-07-14: Тёма оформил платный тариф Unisender Go** — блокер
рассылки на произвольные адреса снят.

## Осталось на Тёму / на потом

- **Ротация секретов** — при любой утечке `/root/vibeclub/.env`
  перегенерировать
  `gen-keys.mjs`, обновить на сервере и в `js/config.js` (anon-ключ).
- **Мониторинг:** три Timeweb HTTP-монитора, backup-watchdog и email-пороги
  диска 90%/100% настроены. Synthetic failure drill и доставка тестового
  incident-алерта ещё не проверены — см. `docs/16-security-status.md`.
- **Umami-пароль** и root-пароль VPS — держать только в менеджере паролей.
