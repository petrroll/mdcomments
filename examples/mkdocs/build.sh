#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")"

echo "=== MkDocs / Python-Markdown ==="
pip install -q -r requirements.txt 2>/dev/null
bash build-default.sh
bash build-plugin.sh
bash build-pdf.sh
echo ""
