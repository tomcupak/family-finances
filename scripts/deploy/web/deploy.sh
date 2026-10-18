#!/usr/bin/env bash
# Builds, zips, uploads and unpacks a web app on a remote server over SSH.
# Usage: deploy.sh <app> [user@host] [remote_dir]   (default user@host: DEPLOY_TARGET from .env)
#
# This does NOT start/restart anything - the app is a static SPA with no server process
# of its own, fronted by Nginx. It only gets the files in place and keeps config.json
# pointed at a stable, out-of-tree location so a redeploy never clobbers it:
#
#   remote_dir/config.json -> symlink -> /etc/family-finances/web/config.json
#
# On the very first deploy, /etc/family-finances/web/config.json doesn't exist yet, so
# it's seeded from the build's own config.json (dev-local defaults) - edit it by hand on the
# server afterwards to point at the real API URL. Every later deploy leaves the existing
# config alone and just re-links to it.
#
# No sudo: the SSH user must own the parent of remote_dir (the previous copy is renamed to
# remote_dir.old) and /etc/family-finances/web - see "Server setup" in scripts/deploy/README.md.
set -euo pipefail
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "$SCRIPT_DIR/lib.sh"

app="${1:?Usage: deploy.sh <family-finances> [user@host] [remote_dir]}"
target="$(deploy_target "${2:-}")"
remote_dir="${3:-/var/www/$app/web}"
remote_config_dir="/etc/family-finances/web"
remote_config="$remote_config_dir/config.json"

app_info "$app"
"$SCRIPT_DIR/package.sh" "$app"

artifact="$REPO_ROOT/dist-deploy/web-$app.zip"
remote_zip="/tmp/family-finances-web-$app.zip"

log "Uploading web-$app.zip to $target:$remote_zip"
scp "${SSH_OPTS[@]}" "$artifact" "$target:$remote_zip"

log "Unpacking on $target into $remote_dir (previous copy kept as $remote_dir.old)"
# shellcheck disable=SC2029
ssh "${SSH_OPTS[@]}" "$target" "
	set -e
	rm -rf '$remote_dir.new'
	mkdir -p '$remote_dir.new'
	unzip -q '$remote_zip' -d '$remote_dir.new'
	rm -f '$remote_zip'
	find '$remote_dir.new' -type d -exec chmod 755 {} +
	find '$remote_dir.new' -type f -exec chmod 644 {} +

	[ -d '$remote_config_dir' ] || { echo '[deploy] error: $remote_config_dir missing - see Server setup in scripts/deploy/README.md' >&2; exit 1; }
	if [ ! -e '$remote_config' ] && [ ! -L '$remote_config' ]; then
		echo '[deploy] seeding $remote_config from the build - edit it on the server to point at the real API URL' >&2
		mv '$remote_dir.new/config.json' '$remote_config'
	else
		rm -f '$remote_dir.new/config.json'
	fi
	ln -sf '$remote_config' '$remote_dir.new/config.json'

	rm -rf '$remote_dir.old'
	[ -d '$remote_dir' ] && mv '$remote_dir' '$remote_dir.old' || true
	mv '$remote_dir.new' '$remote_dir'
"

log "Deployed $app to $target:$remote_dir (config.json symlinked to $remote_config)"
