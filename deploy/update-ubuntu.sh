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
source /etc/cs2-boost.env
export PATH=/opt/node24/bin:/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin
cd /opt/cs2-boost
as_app() {
    runuser -u cs2boost -- env PATH="$PATH" HOME=/var/lib/cs2-boost DATABASE_PATH="$DATABASE_PATH" BACKUP_DIR="$BACKUP_DIR" APP_ORIGIN="$APP_ORIGIN" ALLOW_HTTP_TESTING="${ALLOW_HTTP_TESTING:-0}" TRUST_PROXY="${TRUST_PROXY:-1}" SEARCH_INDEXING="${SEARCH_INDEXING:-0}" NEXT_TELEMETRY_DISABLED=1 "$@"
}
as_app node scripts/backup.mjs
systemctl stop cs2-boost
trap 'echo "Update stopped. The database backup is available. Fix the reported error and rerun this update script."' ERR
as_app npm ci --include=dev --no-audit --no-fund
as_app env NODE_OPTIONS=--max-old-space-size=768 npm run build
install -d -m 700 -o cs2boost -g cs2boost /opt/cs2-boost/.next/cache
as_app env NODE_ENV=production node scripts/migrate.mjs
as_app env NODE_ENV=production node scripts/check-config.mjs
systemctl start cs2-boost
curl --fail --retry 10 --retry-connrefused --retry-delay 2 http://127.0.0.1:3000/api/health
printf '\n%s\n' 'Update complete. Existing Nginx, HTTPS and environment settings were preserved.'
