#!/usr/bin/env bash
# Builds a .deb, uploads it, and installs it on a remote server over SSH - which enables
# and (re)starts the systemd service via the package's postinst.
# Usage: deploy-deb.sh <app> [user@host]   (default: DEPLOY_TARGET from .env)
#
# The SSH user needs passwordless sudo for exactly `dpkg -i /tmp/family-finances-<app>_*.deb`
# (see "Server setup" in scripts/deploy/README.md) - the package has no apt dependencies, so
# there's no `apt-get -f install` fallback to grant as well.
set -euo pipefail
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "$SCRIPT_DIR/lib.sh"

app="${1:?Usage: deploy-deb.sh <api> [user@host]}"
target="$(deploy_target "${2:-}")"

app_info "$app"
"$SCRIPT_DIR/package-deb.sh" "$app"
ensure_node_runtime

version="$(node -p "require('$REPO_ROOT/package.json').version")"
deb_file="family-finances-${app}_${version}_${DEB_ARCH}.deb"
local_path="$REPO_ROOT/dist-deploy/$deb_file"
remote_path="/tmp/$deb_file"

log "Uploading $deb_file to $target"
scp "${SSH_OPTS[@]}" "$local_path" "$target:$remote_path"

log "Installing on $target (sudo dpkg -i)"
# shellcheck disable=SC2029
ssh "${SSH_OPTS[@]}" "$target" "
	set -e
	trap 'rm -f \"$remote_path\"' EXIT
	sudo -n dpkg -i '$remote_path'
"

log "Service status on $target:"
ssh "${SSH_OPTS[@]}" "$target" "systemctl --no-pager --lines=10 status $APP_SERVICE_NAME.service || true"
