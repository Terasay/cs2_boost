#!/usr/bin/env bash
set -euo pipefail

if [[ $EUID -ne 0 ]]; then
    echo "Run with sudo bash deploy/install-ubuntu.sh"
    exit 1
fi
source /etc/os-release
if [[ "$ID" != ubuntu ]]; then
    echo "This installer requires Ubuntu with systemd"
    exit 1
fi
repo_dir=$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd -P)
if [[ "$repo_dir" != /opt/cs2-boost ]]; then
    echo "Clone the repository into /opt/cs2-boost first"
    exit 1
fi
for existing in /etc/cs2-boost.env /etc/systemd/system/cs2-boost.service /etc/nginx/sites-available/cs2-boost /etc/nginx/sites-enabled/cs2-boost /var/lib/cs2-boost/cs2.sqlite; do
    if [[ -e "$existing" || -L "$existing" ]]; then
        echo "Existing installation detected at $existing. Refusing to overwrite it."
        exit 1
    fi
done

apt-get update
apt-get install -y ca-certificates curl xz-utils git nginx build-essential python3

if [[ ! -x /opt/node24/bin/node ]]; then
    case "$(dpkg --print-architecture)" in
        amd64) node_arch=x64 ;;
        arm64) node_arch=arm64 ;;
        *) echo "Only amd64 and arm64 are supported"; exit 1 ;;
    esac
    temp_dir=$(mktemp -d)
    curl --fail --show-error --silent --location https://nodejs.org/dist/latest-v24.x/SHASUMS256.txt -o "$temp_dir/SHASUMS256.txt"
    node_file=$(awk -v suffix="-linux-$node_arch.tar.xz" 'substr($2, length($2)-length(suffix)+1) == suffix {print $2}' "$temp_dir/SHASUMS256.txt")
    if [[ ! "$node_file" =~ ^node-v24\.[0-9]+\.[0-9]+-linux-(x64|arm64)\.tar\.xz$ ]]; then
        echo "Could not find the Node.js 24 archive"
        exit 1
    fi
    curl --fail --show-error --location "https://nodejs.org/dist/latest-v24.x/$node_file" -o "$temp_dir/$node_file"
    expected=$(awk -v name="$node_file" '$2 == name {print $1}' "$temp_dir/SHASUMS256.txt")
    printf '%s  %s\n' "$expected" "$temp_dir/$node_file" | sha256sum --check
    install -d -m 755 /opt/node24
    tar -xJf "$temp_dir/$node_file" --strip-components=1 -C /opt/node24 --no-same-owner
    rm -- "$temp_dir/$node_file" "$temp_dir/SHASUMS256.txt"
    rmdir -- "$temp_dir"
fi
export PATH=/opt/node24/bin:/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin
node -e 'if (process.versions.node.split(".")[0] !== "24") process.exit(1)'

if [[ $(awk '/SwapTotal:/ {print $2}' /proc/meminfo) -lt 1048576 ]]; then
    if [[ -e /swap-cs2-boost ]]; then
        echo "/swap-cs2-boost already exists. Activate or inspect it before retrying."
        exit 1
    fi
    (umask 077; fallocate -l 2G /swap-cs2-boost)
    mkswap /swap-cs2-boost
    swapon /swap-cs2-boost
    printf '%s\n' '/swap-cs2-boost none swap sw 0 0' >> /etc/fstab
fi

if ! id cs2boost >/dev/null 2>&1; then
    useradd --system --user-group --home-dir /var/lib/cs2-boost --create-home --shell /usr/sbin/nologin cs2boost
fi
install -d -m 700 -o cs2boost -g cs2boost /var/lib/cs2-boost /var/backups/cs2-boost
chown -R cs2boost:cs2boost /opt/cs2-boost
cd /opt/cs2-boost
runuser -u cs2boost -- env PATH="$PATH" HOME=/var/lib/cs2-boost npm ci --no-audit --no-fund
runuser -u cs2boost -- env PATH="$PATH" HOME=/var/lib/cs2-boost NEXT_TELEMETRY_DISABLED=1 NODE_OPTIONS=--max-old-space-size=768 npm run build
install -d -m 700 -o cs2boost -g cs2boost /opt/cs2-boost/.next/cache
runuser -u cs2boost -- env PATH="$PATH" NODE_ENV=production DATABASE_PATH=/var/lib/cs2-boost/cs2.sqlite node scripts/migrate.mjs

install -m 640 -o root -g cs2boost deploy/cs2-boost.env /etc/cs2-boost.env
install -m 644 deploy/cs2-boost.service deploy/cs2-boost-backup.service deploy/cs2-boost-backup.timer /etc/systemd/system/
install -m 644 deploy/nginx.conf /etc/nginx/sites-available/cs2-boost
ln -s /etc/nginx/sites-available/cs2-boost /etc/nginx/sites-enabled/cs2-boost
nginx -t
systemctl daemon-reload
systemctl enable --now cs2-boost
systemctl enable --now cs2-boost-backup.timer
systemctl enable nginx
systemctl reload-or-restart nginx
curl --fail --retry 10 --retry-connrefused --retry-delay 2 http://127.0.0.1:3000/api/health
printf '\n%s\n' 'Installed: http://194.238.42.45' 'HTTP testing only. Configure HTTPS before using real passwords.' 'Check your firewall: public TCP 80 and 443; port 3000 stays private.'
