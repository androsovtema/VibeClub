#!/bin/sh
# Однократная идемпотентная подготовка deploy-user; запускать только root на VPS.
set -eu

DEPLOY_USER=wedesignerz-deploy
DEPLOY_HOME=/home/wedesignerz-deploy
DEPLOY_ROOT=/srv/wedesignerz
SCRIPT_DIR=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
DEPLOY_HELPER="$SCRIPT_DIR/wedesignerz-deploy"

die() {
  echo "provision-frontend-deploy: $*" >&2
  exit 1
}

[ "$(id -u)" -eq 0 ] || die 'нужны права root.'
[ "$#" -eq 1 ] || die 'использование: provision-frontend-deploy.sh /path/to/precreated-public-key.pub'
PUBLIC_KEY_FILE=$1
[ -f "$PUBLIC_KEY_FILE" ] && [ ! -L "$PUBLIC_KEY_FILE" ] || die 'нужен обычный файл заранее созданного public key.'
[ -f "$DEPLOY_HELPER" ] && [ ! -L "$DEPLOY_HELPER" ] || die 'рядом отсутствует wedesignerz-deploy.'
grep -q 'PRIVATE KEY' "$PUBLIC_KEY_FILE" && die 'private key запрещён.'
ssh-keygen -l -f "$PUBLIC_KEY_FILE" >/dev/null 2>&1 || die 'public key не проходит проверку ssh-keygen.'

if ! id "$DEPLOY_USER" >/dev/null 2>&1; then
  useradd --system --create-home --home-dir "$DEPLOY_HOME" --shell /bin/sh --user-group "$DEPLOY_USER"
fi

install -d -o "$DEPLOY_USER" -g "$DEPLOY_USER" -m 0755 "$DEPLOY_ROOT" "$DEPLOY_ROOT/incoming" "$DEPLOY_ROOT/releases"
install -d -o "$DEPLOY_USER" -g "$DEPLOY_USER" -m 0700 "$DEPLOY_HOME/.ssh"
install -o root -g root -m 0755 "$DEPLOY_HELPER" /usr/local/bin/wedesignerz-deploy

temporary=$(mktemp "$DEPLOY_HOME/.ssh/authorized_keys.XXXXXX")
trap 'rm -f -- "$temporary"' EXIT HUP INT TERM
{
  printf '%s' 'restrict,no-pty '
  tr -d '\r' < "$PUBLIC_KEY_FILE"
  printf '\n'
} > "$temporary"
chown "$DEPLOY_USER:$DEPLOY_USER" "$temporary"
chmod 0600 "$temporary"
mv -f -- "$temporary" "$DEPLOY_HOME/.ssh/authorized_keys"
trap - EXIT HUP INT TERM

echo "Готово: $DEPLOY_USER может принимать releases без root/sudo."
