#!/usr/bin/env bash
# build-plugin.sh — Render input.md with pandoc + mdcomments Lua filter.
set -euo pipefail
cd "$(dirname "$0")"

INPUT="../input.md"

pandoc "$INPUT" \
  --standalone \
  --lua-filter=filter-mdcomments.lua \
  --metadata title="mdcomments — Pandoc (plugin)" \
  -f markdown+footnotes-citations-smart \
  -t html5 \
  -o output-plugin.html

echo "✓ pandoc plugin → output-plugin.html"
