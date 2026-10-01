#!/usr/bin/env bash
set -euo pipefail

if [[ $EUID -ne 0 || $# -ne 1 || ! -f /etc/cs2-boost.env ]]; then
    echo "Usage: sudo bash deploy/test-email-ubuntu.sh your-email@example.com"
    exit 1
fi
exec runuser -u cs2boost -- /opt/node24/bin/node --env-file=/etc/cs2-boost.env /opt/cs2-boost/scripts/test-email.mjs "$1"
