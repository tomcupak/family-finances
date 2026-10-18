#!/usr/bin/env bash
# Builds a .deb for an app, containing a systemd unit (family-finances-<app>.service) that
# gets enabled and (re)started on install.
# Usage: package-deb.sh <app> [--skip-build]
#
# The package bundles its own Node.js runtime (see ensure_node_runtime in lib.sh) rather
# than depending on apt's nodejs - Debian/Ubuntu's own nodejs package usually lags well
# behind what this repo requires. This also makes the package architecture-specific
# (amd64/arm64), unlike a plain "Architecture: all" package.
#
# Secrets/config are NOT part of the package. The unit reads an optional env file at
# /etc/family-finances/<app>.env (see scripts/deploy/README.md) - create that by hand on
# the server before the first install.
set -euo pipefail
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "$SCRIPT_DIR/lib.sh"

app="${1:?Usage: package-deb.sh <api> [--skip-build]}"
skip_build=false
[ "${2:-}" = "--skip-build" ] && skip_build=true

app_info "$app"
ensure_node_runtime

cd "$REPO_ROOT"
if [ "$skip_build" = false ]; then
	"$SCRIPT_DIR/build.sh" "$app"
fi
[ -f "$APP_ENTRYPOINT" ] || die "$APP_ENTRYPOINT not found - did the build run?"

version="$(node -p "require('./package.json').version")"
pkg_name="family-finances-$app"
install_dir="opt/family-finances/$app"

work_dir="$(mktemp -d)"
trap 'rm -rf "$work_dir"' EXIT
stage="$work_dir/$pkg_name"
mkdir -p "$stage/$install_dir" "$stage/DEBIAN" "$stage/etc/systemd/system"

log "Staging artifacts for $app"
stage_artifacts "$stage/$install_dir"

log "Installing production-only dependencies (npm ci --omit=dev)"
npm ci --omit=dev --prefix "$stage/$install_dir" --loglevel=error

log "Bundling Node.js v$NODE_VERSION runtime ($DEB_ARCH)"
mkdir -p "$stage/$install_dir/node/bin"
cp "$NODE_BIN" "$stage/$install_dir/node/bin/node"

log "Writing DEBIAN/control, postinst, postrm"
cat >"$stage/DEBIAN/control" <<EOF
Package: $pkg_name
Version: $version
Section: web
Priority: optional
Architecture: $DEB_ARCH
Maintainer: ${DEPLOY_MAINTAINER:-Family Finances <root@localhost>}
Description: Family Finances $app, installed as a systemd service ($APP_SERVICE_NAME.service).
 Bundles its own Node.js v$NODE_VERSION runtime - no system nodejs required.
EOF

cat >"$stage/DEBIAN/postinst" <<EOF
#!/bin/sh
set -e
id -u $SERVICE_USER >/dev/null 2>&1 || useradd --system --no-create-home --shell /usr/sbin/nologin $SERVICE_USER
systemctl daemon-reload
systemctl enable $APP_SERVICE_NAME.service
systemctl restart $APP_SERVICE_NAME.service
EOF
chmod 755 "$stage/DEBIAN/postinst"

cat >"$stage/DEBIAN/postrm" <<EOF
#!/bin/sh
set -e
if [ "\$1" = remove ] || [ "\$1" = purge ]; then
	systemctl stop $APP_SERVICE_NAME.service 2>/dev/null || true
	systemctl disable $APP_SERVICE_NAME.service 2>/dev/null || true
	systemctl daemon-reload || true
fi
EOF
chmod 755 "$stage/DEBIAN/postrm"

log "Writing systemd unit"
cat >"$stage/etc/systemd/system/$APP_SERVICE_NAME.service" <<EOF
[Unit]
Description=Family Finances $app
After=network.target postgresql.service

[Service]
Type=simple
WorkingDirectory=/$install_dir
ExecStart=/$install_dir/node/bin/node /$install_dir/$APP_ENTRYPOINT
Restart=on-failure
RestartSec=5
Environment=NODE_ENV=production
EnvironmentFile=-/etc/family-finances/$app.env
User=$SERVICE_USER
NoNewPrivileges=true
ProtectSystem=strict
ProtectHome=true
PrivateTmp=true

[Install]
WantedBy=multi-user.target
EOF

mkdir -p "$REPO_ROOT/dist-deploy"
deb_path="$REPO_ROOT/dist-deploy/${pkg_name}_${version}_${DEB_ARCH}.deb"
dpkg-deb --build --root-owner-group "$stage" "$deb_path"

log "Package ready: dist-deploy/$(basename "$deb_path")"
