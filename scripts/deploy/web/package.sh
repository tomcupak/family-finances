#!/usr/bin/env bash
# Builds a web app and zips its static build output into a self-contained deploy artifact.
# Usage: package.sh <app> [--skip-build]
#
# The zip contains exactly what vite emitted into web/dist/<app> (index.html, assets/,
# config.json with dev-local defaults) - nothing else. There's no node_modules to bundle:
# it's a static SPA, there's no server process of its own to run.
set -euo pipefail
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "$SCRIPT_DIR/lib.sh"

app="${1:?Usage: package.sh <family-finances> [--skip-build]}"
skip_build=false
[ "${2:-}" = "--skip-build" ] && skip_build=true

app_info "$app"
cd "$REPO_ROOT"

if [ "$skip_build" = false ]; then
	"$SCRIPT_DIR/build.sh" "$app"
fi

[ -d "$APP_DIST_DIR" ] || die "$APP_DIST_DIR not found - did the build run?"

mkdir -p "$REPO_ROOT/dist-deploy"
artifact="$REPO_ROOT/dist-deploy/web-$app.zip"
rm -f "$artifact"
(cd "$APP_DIST_DIR" && zip -qr "$artifact" .)

log "Package ready: dist-deploy/web-$app.zip"
