#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/emp29"
if ! command -v node >/dev/null; then
  echo 'Install Node.js 24 LTS, then run this script again.' >&2
  exit 1
fi
if [[ ! -d node_modules ]]; then npm ci --omit=dev --ignore-scripts; fi
exec npm start
