#!/usr/bin/env bash
# build-default.sh — Render input.md with pandoc using built-in footnotes.
# ==text== is NOT supported natively, so it passes through as literal text.
set -euo pipefail
cd "$(dirname "$0")"

CSS_FILE="../shared/style-default.css"
INPUT="../input.md"

pandoc "$INPUT" \
  --standalone \
  --css="$CSS_FILE" \
  --embed-resources \
  --metadata title="mdcomments — Pandoc (default)" \
  -f markdown+footnotes-citations \
  -t html5 \
  -o output-default.html

echo "✓ pandoc default → output-default.html"
