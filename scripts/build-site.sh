#!/bin/sh
# Собирает только публикуемый статический артефакт. Скрипт намеренно не копирует
# symlink и dotfiles: в _site попадают только обычные файлы сайта.
set -eu

SCRIPT_DIR=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
REPO_ROOT=$(CDPATH= cd -- "$SCRIPT_DIR/.." && pwd)
SITE_DIR="$REPO_ROOT/_site"

case "$SITE_DIR" in
  "$REPO_ROOT"/_site) ;;
  *)
    echo "Небезопасный путь артефакта: $SITE_DIR" >&2
    exit 1
    ;;
esac

rm -rf -- "$SITE_DIR"
mkdir -p -- "$SITE_DIR"

cd "$REPO_ROOT"

# Сначала создаём только публичные директории, затем копируем обычные файлы.
# find по умолчанию не следует по symbolic link; type f исключает их из сборки.
find . -mindepth 1 \
  \( -name '.*' -o -path './node_modules' -o -path './docs' -o -path './audits' \
     -o -path './supabase' -o -path './infra' -o -path './scripts' -o -path './_site' \
     -o -name 'CLAUDE.md' -o -name 'AGENTS.md' -o -name 'package.json' \
     -o -name 'package-lock.json' -o -name 'eslint.config.js' -o -name '.DS_Store' \) -prune -o \
  -type d -exec mkdir -p -- "$SITE_DIR"/{} \;

find . -mindepth 1 \
  \( -name '.*' -o -path './node_modules' -o -path './docs' -o -path './audits' \
     -o -path './supabase' -o -path './infra' -o -path './scripts' -o -path './_site' \
     -o -name 'CLAUDE.md' -o -name 'AGENTS.md' -o -name 'package.json' \
     -o -name 'package-lock.json' -o -name 'eslint.config.js' -o -name '.DS_Store' \) -prune -o \
  -type f -exec cp -p -- {} "$SITE_DIR"/{} \;

echo "✓ Артефакт собран: $SITE_DIR"
