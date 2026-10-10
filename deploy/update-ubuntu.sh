#!/usr/bin/env bash
set -euo pipefail

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
systemctl stop cs2-boost
trap 'echo "Update failed after the service was stopped. The database backup is available. Fix the reported error and rerun this script."' ERR
if [[ "$install_dependencies" -eq 1 ]]; then
    as_app env NODE_OPTIONS=--max-old-space-size=384 npm ci --include=dev --ignore-scripts --prefer-offline --no-audit --no-fund
    as_app node scripts/dependencies-ready.mjs
    printf '%s\n' "$fingerprint" | runuser -u cs2boost -- tee "$marker" >/dev/null
fi
as_app env NODE_OPTIONS=--max-old-space-size=512 npm run build
install -d -m 700 -o cs2boost -g cs2boost /opt/cs2-boost/.next/cache
as_app env NODE_ENV=production node --env-file=/etc/cs2-boost.env scripts/migrate.mjs
as_app env NODE_ENV=production node --env-file=/etc/cs2-boost.env scripts/check-config.mjs
systemctl start cs2-boost
install -m 644 deploy/cs2-boost-payments.service deploy/cs2-boost-payments.timer /etc/systemd/system/
systemctl daemon-reload
systemctl enable --now cs2-boost-payments.timer
curl --fail --retry 10 --retry-connrefused --retry-delay 2 http://127.0.0.1:3000/api/health
if [[ "$clean_cache" -eq 1 ]]; then
    as_app npm cache clean --force
fi
printf '\n%s\n' 'Update complete. Existing Nginx, HTTPS and environment settings were preserved.'
