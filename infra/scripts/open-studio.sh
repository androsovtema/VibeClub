#!/usr/bin/env bash
# Одна команда для оператора: запустить закрытый Studio на VPS, открыть
# SSH-туннель и браузер; при Ctrl+C остановить tunnel и контейнер Studio.

set -euo pipefail

WDZ_STUDIO_SSH_TARGET="${WDZ_STUDIO_SSH_TARGET:-root@api.wedesignerz.com}"
WDZ_STUDIO_LOCAL_PORT="${WDZ_STUDIO_LOCAL_PORT:-3000}"
WDZ_STUDIO_REMOTE_DIR="/root/vibeclub"
WDZ_STUDIO_URL="http://127.0.0.1:${WDZ_STUDIO_LOCAL_PORT}"
WDZ_STUDIO_TUNNEL_PID=""
WDZ_STUDIO_STARTED=false

studio_compose_command() {
  printf 'cd %q && docker compose -f docker-compose.yml -f docker-compose.studio.yml' \
    "$WDZ_STUDIO_REMOTE_DIR"
}

stop_studio() {
  local exit_code=$?

  trap - EXIT

  if [[ -n "$WDZ_STUDIO_TUNNEL_PID" ]] && kill -0 "$WDZ_STUDIO_TUNNEL_PID" 2>/dev/null; then
    kill "$WDZ_STUDIO_TUNNEL_PID" 2>/dev/null || true
    wait "$WDZ_STUDIO_TUNNEL_PID" 2>/dev/null || true
  fi

  if [[ "$WDZ_STUDIO_STARTED" == true ]]; then
    printf '\nОстанавливаю Supabase Studio на VPS...\n'
    ssh -o BatchMode=yes "$WDZ_STUDIO_SSH_TARGET" \
      "$(studio_compose_command) stop studio >/dev/null" || \
      printf 'Предупреждение: Studio не удалось остановить автоматически.\n' >&2
  fi

  printf 'Studio закрыт. Production API и база продолжили работать.\n'
  exit "$exit_code"
}

trap stop_studio EXIT
trap 'exit 130' INT TERM

if [[ ! "$WDZ_STUDIO_LOCAL_PORT" =~ ^[0-9]+$ ]] ||
   ((WDZ_STUDIO_LOCAL_PORT < 1024 || WDZ_STUDIO_LOCAL_PORT > 65535)); then
  printf 'Некорректный локальный порт: %s\n' "$WDZ_STUDIO_LOCAL_PORT" >&2
  exit 2
fi

for required_command in ssh curl; do
  if ! command -v "$required_command" >/dev/null 2>&1; then
    printf 'Не найдена команда %s.\n' "$required_command" >&2
    exit 2
  fi
done

if command -v lsof >/dev/null 2>&1 &&
   lsof -nP -iTCP:"$WDZ_STUDIO_LOCAL_PORT" -sTCP:LISTEN >/dev/null 2>&1; then
  printf 'Порт %s уже занят. Закрой использующую его программу или запусти:\n' \
    "$WDZ_STUDIO_LOCAL_PORT" >&2
  printf 'WDZ_STUDIO_LOCAL_PORT=3001 ./infra/scripts/open-studio.sh\n' >&2
  exit 2
fi

printf 'Проверяю production и запускаю закрытый Supabase Studio...\n'
ssh -o BatchMode=yes "$WDZ_STUDIO_SSH_TARGET" "$(studio_compose_command) config -q"
WDZ_STUDIO_STARTED=true
ssh -o BatchMode=yes "$WDZ_STUDIO_SSH_TARGET" \
  "$(studio_compose_command) up -d --no-deps studio >/dev/null"

ssh -o BatchMode=yes "$WDZ_STUDIO_SSH_TARGET" '
  for attempt in $(seq 1 25); do
    studio_state=$(docker inspect --format "{{if .State.Health}}{{.State.Health.Status}}{{else}}{{.State.Status}}{{end}}" vibeclub-studio 2>/dev/null || true)
    if [ "$studio_state" = healthy ]; then exit 0; fi
    if [ "$studio_state" = exited ] || [ "$studio_state" = dead ]; then exit 1; fi
    sleep 2
  done
  exit 1
'

printf 'Открываю защищённый SSH-туннель...\n'
ssh \
  -o BatchMode=yes \
  -o ExitOnForwardFailure=yes \
  -o ServerAliveInterval=30 \
  -N \
  -L "127.0.0.1:${WDZ_STUDIO_LOCAL_PORT}:127.0.0.1:3000" \
  "$WDZ_STUDIO_SSH_TARGET" &
WDZ_STUDIO_TUNNEL_PID=$!

for _ in $(seq 1 20); do
  if curl -fs -o /dev/null "$WDZ_STUDIO_URL/api/platform/profile"; then
    break
  fi
  if ! kill -0 "$WDZ_STUDIO_TUNNEL_PID" 2>/dev/null; then
    printf 'SSH-туннель завершился до открытия Studio.\n' >&2
    exit 1
  fi
  sleep 0.5
done

if ! curl -fsS -o /dev/null "$WDZ_STUDIO_URL/api/platform/profile"; then
  printf 'Studio не ответил через SSH-туннель.\n' >&2
  exit 1
fi

if [[ "$(uname -s)" == Darwin ]]; then
  open "$WDZ_STUDIO_URL"
elif command -v xdg-open >/dev/null 2>&1; then
  xdg-open "$WDZ_STUDIO_URL" >/dev/null 2>&1 || true
fi

printf '\nSupabase Studio открыт: %s\n' "$WDZ_STUDIO_URL"
printf 'Не закрывай это окно терминала, пока работаешь.\n'
printf 'Когда закончишь, нажми Ctrl+C — Studio и туннель остановятся.\n\n'

wait "$WDZ_STUDIO_TUNNEL_PID"
