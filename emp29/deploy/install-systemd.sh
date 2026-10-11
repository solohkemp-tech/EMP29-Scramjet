#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."
if [[ "${EUID}" != 0 ]]; then
  echo 'Run with sudo only after reading this script and completing npm run setup.' >&2
  exit 1
fi
if [[ ! -f .env ]]; then
  echo 'Missing .env. Run npm run setup first.' >&2
  exit 1
fi
if [[ ! -f dist/build.json || ! -d node_modules ]]; then
  echo 'Install dependencies first: npm ci --omit=dev' >&2
  exit 1
fi
if ! command -v node >/dev/null; then
  echo 'Node.js 22.16+ (24 LTS recommended) is required.' >&2
  exit 1
fi
if ! id emp29 >/dev/null 2>&1; then
  useradd --system --user-group --home /nonexistent --shell /usr/sbin/nologin emp29
fi
task_root="$(cd .. && pwd)"
task_node="$(command -v node)"
if [[ "$task_root" == *' '* || "$task_node" == *' '* || "$task_node" == /root/* || "$task_root" == /root/* || "$task_root" == /home/* ]]; then
  echo 'Use an installation path without spaces outside /root, with system-wide Node.js.' >&2
  exit 1
fi
chown -R emp29:emp29 "$task_root/emp29"
chmod 600 .env
if [[ -f /etc/systemd/system/emp29.service ]]; then
  cp /etc/systemd/system/emp29.service "/etc/systemd/system/emp29.service.backup-$(date +%s)"
fi
sed -e "s|WorkingDirectory=/opt/emp29/emp29|WorkingDirectory=$task_root/emp29|" -e "s|ExecStart=/usr/bin/node|ExecStart=$task_node|" deploy/emp29.service > /etc/systemd/system/emp29.service
systemctl daemon-reload
systemctl enable --now emp29.service
systemctl --no-pager status emp29.service
