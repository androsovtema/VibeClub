#!/usr/bin/env bash
# Удаляет публичный backup-health marker, если последний успешный S3 backup
# старше 26 часов. Caddy отдаёт marker по /health/backup, а внешний uptime
# монитор воспринимает 404 как инцидент.

set -euo pipefail

cd "$(dirname "$0")/.."

MAX_AGE_MINUTES=1560
MARKER="./volumes/backup-health/backup-ok.txt"

if [ ! -f "$MARKER" ]; then
  echo "[backup-watchdog] marker отсутствует: backup не подтверждён"
  exit 0
fi

if find "$MARKER" -mmin "+${MAX_AGE_MINUTES}" -print -quit | grep -q .; then
  rm -f "$MARKER"
  echo "[backup-watchdog] marker удалён: свежего backup нет более 26 часов"
else
  echo "[backup-watchdog] backup свежий"
fi
