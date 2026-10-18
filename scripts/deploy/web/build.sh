#!/usr/bin/env bash
# Builds a single web app. Usage: build.sh <app>
set -euo pipefail
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "$SCRIPT_DIR/lib.sh"

app="${1:?Usage: build.sh <family-finances>}"
app_info "$app"

cd "$REPO_ROOT"
log "Building $app: $APP_BUILD_CMD"
eval "$APP_BUILD_CMD"
log "Build finished for $app"
