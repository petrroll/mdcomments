#!/usr/bin/env bash
# build-pdf.sh — Generate PDF output from pandoc (default + plugin).
# Uses weasyprint for HTML→PDF, then pymupdf to inject PDF comment
# annotations for the plugin variant.
set -euo pipefail
cd "$(dirname "$0")"

INPUT="../input.md"
SHARED="../shared"
ADD_COMMENTS="$SHARED/add-pdf-comments.py"

if ! command -v weasyprint &>/dev/null; then
  echo "⚠ weasyprint not found — skipping PDF generation"
  echo "  Install: pip install weasyprint"
  exit 0
fi

# ── Default PDF (standard footnotes) ──
pandoc "$INPUT" \
  --standalone \
  --embed-resources \
  --css="$SHARED/style-default.css" \
  --metadata title="mdcomments — Pandoc (default)" \
  -f markdown+footnotes \
  -t html5 \
  -o /tmp/mdcomments-pandoc-default.html

weasyprint /tmp/mdcomments-pandoc-default.html output-default.pdf 2>/dev/null
echo "✓ pandoc default PDF (weasyprint) → output-default.pdf"

# ── Plugin PDF (comment annotations) ──
# 1. Generate a clean HTML (no sidebar) for good PDF typography
pandoc "$INPUT" \
  --standalone \
  --embed-resources \
  --css="$SHARED/style-default.css" \
  --metadata title="mdcomments — Pandoc (plugin)" \
  -f markdown+footnotes \
  -t html5 \
  -o /tmp/mdcomments-pandoc-plugin-clean.html

weasyprint /tmp/mdcomments-pandoc-plugin-clean.html /tmp/mdcomments-pandoc-plugin-base.pdf 2>/dev/null

# 2. Add comment threads as native PDF annotations
python3 "$ADD_COMMENTS" "$INPUT" \
  /tmp/mdcomments-pandoc-plugin-base.pdf \
  output-plugin.pdf
echo "✓ pandoc plugin PDF (weasyprint + PDF annotations) → output-plugin.pdf"
