#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")"

echo "=== Pandoc ==="
bash build-default.sh
bash build-plugin.sh
bash build-pdf.sh
echo ""
