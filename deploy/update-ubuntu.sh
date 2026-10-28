#!/usr/bin/env bash
set -Eeuo pipefail

if [[ $EUID -ne 0 ]]; then
    echo "Run with sudo bash deploy/update-ubuntu.sh"
    exit 1
fi
repo_dir=$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd -P)
if [[ "$repo_dir" != /opt/cs2-boost || ! -f /etc/cs2-boost.env ]]; then
    echo "An existing installation in /opt/cs2-boost is required"
    exit 1
fi
force_dependencies=0
clean_cache=0
for option in "$@"; do
    case "$option" in
        --reinstall) force_dependencies=1 ;;
        --clean-cache) clean_cache=1 ;;
        *) echo "Unknown option: $option"; exit 1 ;;
    esac
done
exec 9>/var/lock/cs2-boost-update.lock
if ! flock -n 9; then
    echo "Another update is already running. Wait for it to finish."
    exit 1
fi
previous_dir="$repo_dir/.update-previous"
if [[ -e "$previous_dir" || -L "$previous_dir" ]]; then
    echo "A previous update needs attention: $previous_dir. Keep these recovery files until the failed update is investigated."
    exit 1
fi
node_bin=/opt/node24/bin/node
"$node_bin" "$repo_dir/scripts/ensure-access-key.mjs" /etc/cs2-boost.env
source /etc/cs2-boost.env
export PATH=/opt/node24/bin:/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin
cd /opt/cs2-boost
as_app() {
    runuser -u cs2boost -- env PATH="$PATH" HOME=/var/lib/cs2-boost DATABASE_PATH="$DATABASE_PATH" BACKUP_DIR="$BACKUP_DIR" APP_ORIGIN="$APP_ORIGIN" ALLOW_HTTP_TESTING="${ALLOW_HTTP_TESTING:-0}" TRUST_PROXY="${TRUST_PROXY:-1}" SEARCH_INDEXING="${SEARCH_INDEXING:-0}" NEXT_TELEMETRY_DISABLED=1 "$@"
}
if [[ $(df -Pk /opt/cs2-boost | awk 'NR == 2 {print $4}') -lt 1048576 ]]; then
    echo "At least 1 GiB of free disk space is required before updating. Run df -h / to inspect the disk."
    exit 1
fi
fingerprint=$(as_app node scripts/dependency-fingerprint.mjs)
marker=/opt/cs2-boost/node_modules/.cs2-dependencies
install_dependencies=1
if [[ "$force_dependencies" -eq 0 && -f "$marker" && $(cat "$marker") == "$fingerprint" ]] && as_app node scripts/dependencies-ready.mjs; then
    install_dependencies=0
    echo "Dependencies are unchanged; keeping installed packages."
else
    echo "Checking the dependency lock file before stopping the website..."
    as_app env NODE_OPTIONS=--max-old-space-size=384 npm ci --dry-run --include=dev --ignore-scripts --prefer-offline --no-audit --no-fund
fi
as_app node scripts/backup.mjs
had_build=0
[[ ! -f .next/BUILD_ID ]] || had_build=1
active_timers=()
phase=preparing
recover_update() {
    local status=$?
    trap - ERR INT TERM
    set +e
    if [[ "$phase" == preparing || "$phase" == building ]]; then
        local restored=1
        if [[ -d "$previous_dir/.next" && -d "$repo_dir/.next/cache" && ! -e "$previous_dir/.next/cache" ]]; then
            mv -- "$repo_dir/.next/cache" "$previous_dir/.next/cache" || restored=0
        fi
        for item in .next node_modules; do
            if [[ -d "$previous_dir/$item" ]]; then
                rm -rf -- "$repo_dir/$item" && mv -- "$previous_dir/$item" "$repo_dir/$item" || restored=0
            fi
        done
        if [[ "$restored" -eq 1 ]]; then
            rmdir -- "$previous_dir" 2>/dev/null
            if [[ "$had_build" -eq 1 ]] && systemctl start cs2-boost && curl --silent --show-error --fail --max-time 5 --retry 10 --retry-connrefused --retry-delay 2 http://127.0.0.1:3000/api/health; then
                for timer in "${active_timers[@]}"; do systemctl start "$timer"; done
                printf '\n%s\n' 'Update failed; the previous build and dependencies were restored. The database was not migrated.'
            else
                echo "Update failed. Previous files were restored, but the website could not be verified. Inspect journalctl -u cs2-boost."
            fi
        else
            echo "File recovery failed. Preserve $previous_dir and inspect the filesystem before retrying."
        fi
    else
        systemctl stop cs2-boost
        echo "Update failed during migration or startup. The database was not rolled back. Previous application files remain in $previous_dir; a verified database backup is available in $BACKUP_DIR."
    fi
    exit "${status:-1}"
}
trap recover_update ERR
trap 'false' INT TERM
mkdir -m 700 -- "$previous_dir"
for worker in mail payments backup; do
    if systemctl cat "cs2-boost-$worker.timer" >/dev/null 2>&1; then
        if systemctl is-active --quiet "cs2-boost-$worker.timer"; then active_timers+=("cs2-boost-$worker.timer"); fi
        systemctl stop "cs2-boost-$worker.timer" "cs2-boost-$worker.service"
    fi
done
systemctl stop cs2-boost
phase=building
if [[ -d .next ]]; then mv -- .next "$previous_dir/.next"; fi
as_app mkdir -p .next
if [[ -d "$previous_dir/.next/cache" ]]; then mv -- "$previous_dir/.next/cache" .next/cache; fi
if [[ "$install_dependencies" -eq 1 ]]; then
    if [[ -d node_modules ]]; then mv -- node_modules "$previous_dir/node_modules"; fi
    as_app env NODE_OPTIONS=--max-old-space-size=384 npm ci --include=dev --ignore-scripts --prefer-offline --no-audit --no-fund
    as_app node scripts/dependencies-ready.mjs
    printf '%s\n' "$fingerprint" | runuser -u cs2boost -- tee "$marker" >/dev/null
fi
as_app env NODE_OPTIONS=--max-old-space-size=512 npm run build
install -d -m 700 -o cs2boost -g cs2boost /opt/cs2-boost/.next/cache
phase=migrating
as_app env NODE_ENV=production node --env-file=/etc/cs2-boost.env scripts/migrate.mjs
as_app env NODE_ENV=production node --env-file=/etc/cs2-boost.env scripts/check-config.mjs
systemctl start cs2-boost
install -m 644 deploy/cs2-boost-payments.service deploy/cs2-boost-payments.timer deploy/cs2-boost-mail.service deploy/cs2-boost-mail.timer /etc/systemd/system/
systemctl daemon-reload
curl --fail --max-time 5 --retry 10 --retry-connrefused --retry-delay 2 http://127.0.0.1:3000/api/health
trap - ERR INT TERM
rm -rf -- "$previous_dir"
systemctl enable --now cs2-boost-payments.timer
systemctl enable --now cs2-boost-mail.timer
for timer in "${active_timers[@]}"; do
    if [[ "$timer" == cs2-boost-backup.timer ]]; then systemctl start "$timer"; fi
done
if [[ "$clean_cache" -eq 1 ]]; then
    as_app npm cache clean --force
fi
printf '\n%s\n' 'Update complete. Existing Nginx, HTTPS and environment settings were preserved.'
