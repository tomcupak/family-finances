#!/usr/bin/env bash
# Shared config/helpers for the deploy scripts. Sourced, not executed directly.

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"

# Keep in sync with .nvmrc / package.json engines.node - packages bundle this exact
# Node.js runtime, so servers don't need a system nodejs package at all.
NODE_VERSION="24.10.0"

# System user the services run as - created by the package's postinst if missing. Must differ
# from the SSH login the deploy scripts use (DEPLOY_TARGET's user, which can sudo), otherwise the service
# would run with sudo rights.
SERVICE_USER="family-finances"

log() { echo "[deploy] $*" >&2; }
die() {
	echo "[deploy] error: $*" >&2
	exit 1
}

# Deployment-specific values (the target server, ...) live in the gitignored repo-root .env, not in
# the repo - see .env.sample. A variable already set in the environment wins over the file.
load_deploy_env() {
	local env_file="$REPO_ROOT/.env" name saved
	local names=(DEPLOY_TARGET DEPLOY_MAINTAINER DEPLOY_SSH_KEY)
	declare -A saved_vals=()
	for name in "${names[@]}"; do
		[ -n "${!name:-}" ] && saved_vals[$name]="${!name}"
	done
	if [ -f "$env_file" ]; then
		# shellcheck disable=SC1090
		. "$env_file"
	fi
	for name in "${!saved_vals[@]}"; do
		saved="${saved_vals[$name]}"
		printf -v "$name" '%s' "$saved"
	done
}
load_deploy_env

# Extra ssh/scp options: DEPLOY_SSH_KEY (path to a private key, `~` allowed) adds `-i <key>`.
# Empty = let ssh pick the key itself (agent, ~/.ssh/config, default keys).
SSH_OPTS=()
if [ -n "${DEPLOY_SSH_KEY:-}" ]; then
	DEPLOY_SSH_KEY="${DEPLOY_SSH_KEY/#\~/$HOME}"
	[ -f "$DEPLOY_SSH_KEY" ] || die "DEPLOY_SSH_KEY not found: $DEPLOY_SSH_KEY"
	SSH_OPTS=(-i "$DEPLOY_SSH_KEY" -o IdentitiesOnly=yes)
fi

# The deploy target (user@host): the explicit argument, else DEPLOY_TARGET from the environment/.env.
deploy_target() {
	local target="${1:-${DEPLOY_TARGET:-}}"
	[ -n "$target" ] || die "no deploy target - pass <user@host> or set DEPLOY_TARGET in .env (see .env.sample)"
	echo "$target"
}

# Downloads (once - cached under .cache/node-runtime/ for subsequent builds) the
# official Node.js release for the build machine's architecture, and sets NODE_BIN to
# its `node` binary and DEB_ARCH to the matching Debian architecture name. Packages
# bundle this single binary instead of depending on apt's nodejs.
ensure_node_runtime() {
	local node_arch
	case "$(uname -m)" in
	x86_64) node_arch="x64"; DEB_ARCH="amd64" ;;
	aarch64) node_arch="arm64"; DEB_ARCH="arm64" ;;
	*) die "unsupported build architecture: $(uname -m)" ;;
	esac

	local dist="node-v$NODE_VERSION-linux-$node_arch"
	local cache_dir="$REPO_ROOT/.cache/node-runtime"
	NODE_BIN="$cache_dir/$dist/bin/node"

	if [ ! -f "$NODE_BIN" ]; then
		log "Downloading Node.js v$NODE_VERSION (linux-$node_arch) runtime (cached under .cache/node-runtime for next time)"
		mkdir -p "$cache_dir"
		curl -fsSL "https://nodejs.org/dist/v$NODE_VERSION/$dist.tar.gz" | tar -xzf - -C "$cache_dir"
	fi
}

# Populates APP_BUILD_CMD, APP_ARTIFACT_PATHS (array, relative to repo root),
# APP_ENTRYPOINT (relative to the install dir) and APP_SERVICE_NAME.
app_info() {
	local app="$1"
	case "$app" in
	api)
		# Nest's webpack build doesn't clean its output dir - start from scratch so no stale
		# file ends up in the package.
		APP_BUILD_CMD="rm -rf dist/apps/$app && npx nest build $app"
		# The migrations are needed at runtime: migrateDb() reads the .sql files straight off disk
		# via a path relative to dist/apps/<app> (config.dbMigrationsPath), they aren't bundled into
		# main.js like the rest of the TS source is. Kept nested at the same depth so that relative
		# path resolves. The workspaces' package.json files are there only for `npm ci`, which
		# refuses a lockfile whose workspaces are missing.
		APP_ARTIFACT_PATHS=(
			"dist/apps/$app"
			"libs/database/src/core/migrations"
			"package.json"
			"package-lock.json"
			"apps/api/package.json"
			"libs/database/package.json"
			"libs/domains/package.json"
			"libs/shared/package.json"
		)
		APP_ENTRYPOINT="dist/apps/$app/main.js"
		APP_SERVICE_NAME="family-finances-$app"
		;;
	*)
		die "unknown app '$app' - known apps: api"
		;;
	esac
}

# Copies APP_ARTIFACT_PATHS from the repo into $1, preserving their repo-relative layout.
stage_artifacts() {
	local dest="$1" path
	for path in "${APP_ARTIFACT_PATHS[@]}"; do
		mkdir -p "$dest/$(dirname "$path")"
		cp -r "$REPO_ROOT/$path" "$dest/$path"
	done
}
