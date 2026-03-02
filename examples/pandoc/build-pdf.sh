#!/usr/bin/env bash
# build-pdf.sh — Generate PDF output from pandoc (default + plugin).
# Uses weasyprint (HTML→PDF) when available, falls back to pdflatex.
set -euo pipefail
cd "$(dirname "$0")"

INPUT="../input.md"

# Default PDF (standard footnotes)
if command -v weasyprint &>/dev/null; then
  # First generate HTML, then convert to PDF via weasyprint
  pandoc "$INPUT" \
    --standalone \
    --embed-resources \
    --css="../shared/style-default.css" \
    --metadata title="mdcomments — Pandoc (default)" \
    -f markdown+footnotes \
    -t html5 \
    -o /tmp/mdcomments-pandoc-default.html

  weasyprint /tmp/mdcomments-pandoc-default.html output-default.pdf 2>/dev/null
  echo "✓ pandoc default PDF (weasyprint) → output-default.pdf"

  # Plugin PDF
  pandoc "$INPUT" \
    --standalone \
    --embed-resources \
    --lua-filter=filter-mdcomments.lua \
    --metadata title="mdcomments — Pandoc (plugin)" \
    -f markdown+footnotes \
    -t html5 \
    -o /tmp/mdcomments-pandoc-plugin.html

  weasyprint /tmp/mdcomments-pandoc-plugin.html output-plugin.pdf 2>/dev/null
  echo "✓ pandoc plugin PDF (weasyprint) → output-plugin.pdf"
else
  echo "⚠ weasyprint not found — skipping PDF generation"
  echo "  Install: pip install weasyprint"
fi
