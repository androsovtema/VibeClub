#!/usr/bin/env bash
# We Designerz — ночной бэкап RU-VPS в S3-совместимое хранилище Timeweb (T-LOC).
# Дамп БД (pg_dump, custom-формат — все схемы базы postgres: public, auth,
# storage — плюс отдельная база umami) + архив файлов storage. Ротация:
# удаляет в бакете всё старше 14 суток.
#
# На VPS содержимое infra/ лежит прямо в /root/vibeclub (RUNBOOK.md, шаг 1.5),
# поэтому скрипт там — /root/vibeclub/scripts/backup.sh.
# Крон (см. RUNBOOK.md, шаг 9):
#   0 3 * * * /root/vibeclub/scripts/backup.sh >> /var/log/vibeclub-backup.log 2>&1
#
# Нужен: aws CLI на хосте (apt install awscli ИЛИ pip install awscli),
# infra/.env с BACKUP_S3_*.

set -euo pipefail

cd "$(dirname "$0")/.."   # -> infra/
set -a
source .env
set +a

export AWS_ACCESS_KEY_ID="$BACKUP_S3_ACCESS_KEY"
export AWS_SECRET_ACCESS_KEY="$BACKUP_S3_SECRET_KEY"
export AWS_DEFAULT_REGION="${BACKUP_S3_REGION:-ru-1}"

STAMP=$(date +%Y-%m-%d_%H-%M)
TMP_DIR=$(mktemp -d)
trap 'rm -rf "$TMP_DIR"' EXIT

DUMP_FILE="$TMP_DIR/db_${STAMP}.dump"
UMAMI_DUMP_FILE="$TMP_DIR/umami_${STAMP}.dump"
STORAGE_ARCHIVE="$TMP_DIR/storage_${STAMP}.tar.gz"

echo "[backup] pg_dump postgres..."
docker compose exec -T db pg_dump -U postgres -Fc -d postgres > "$DUMP_FILE"

echo "[backup] pg_dump umami..."
docker compose exec -T db pg_dump -U postgres -Fc -d umami > "$UMAMI_DUMP_FILE"

echo "[backup] архивирую файлы storage..."
tar -czf "$STORAGE_ARCHIVE" -C ./volumes storage

echo "[backup] загружаю в s3://${BACKUP_S3_BUCKET}..."
aws --endpoint-url "$BACKUP_S3_ENDPOINT" s3 cp "$DUMP_FILE" "s3://${BACKUP_S3_BUCKET}/db/db_${STAMP}.dump"
aws --endpoint-url "$BACKUP_S3_ENDPOINT" s3 cp "$UMAMI_DUMP_FILE" "s3://${BACKUP_S3_BUCKET}/db/umami_${STAMP}.dump"
aws --endpoint-url "$BACKUP_S3_ENDPOINT" s3 cp "$STORAGE_ARCHIVE" "s3://${BACKUP_S3_BUCKET}/storage/storage_${STAMP}.tar.gz"

echo "[backup] ротация — удаляю бэкапы старше 14 суток..."
CUTOFF=$(date -d '14 days ago' +%Y-%m-%d)
for prefix in db storage; do
  aws --endpoint-url "$BACKUP_S3_ENDPOINT" s3 ls "s3://${BACKUP_S3_BUCKET}/${prefix}/" | while read -r _ _ _ name; do
    [ -z "$name" ] && continue
    file_date=$(echo "$name" | grep -oE '[0-9]{4}-[0-9]{2}-[0-9]{2}' | head -1)
    if [ -n "$file_date" ] && [[ "$file_date" < "$CUTOFF" ]]; then
      echo "  удаляю ${prefix}/${name} (старше 14 суток)"
      aws --endpoint-url "$BACKUP_S3_ENDPOINT" s3 rm "s3://${BACKUP_S3_BUCKET}/${prefix}/${name}"
    fi
  done
done

echo "[backup] готово: ${STAMP}"
