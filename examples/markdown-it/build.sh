#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")"

echo "=== markdown-it ==="
npm install --silent 2>/dev/null
node build-default.js
node build-plugin.js
echo ""
