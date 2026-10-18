#!/usr/bin/env bash
# Shared config/helpers for the web deploy scripts. Sourced, not executed directly.

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../../.." && pwd)"

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

# Populates APP_BUILD_CMD and APP_DIST_DIR (relative to repo root - vite's build outDir
# for this app, see web/vite.config.mts) for the given app.
app_info() {
	local app="$1"
	case "$app" in
	family-finances)
		APP_BUILD_CMD="npm run build:web"
		APP_DIST_DIR="web/dist/$app"
		;;
	*)
		die "unknown app '$app' - known apps: family-finances"
		;;
	esac
}
