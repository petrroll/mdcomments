#!/usr/bin/env bash
# build-pdf.sh — Generate PDF from the MkDocs/Python-Markdown output.
set -euo pipefail
cd "$(dirname "$0")"

if command -v weasyprint &>/dev/null; then
  # Default PDF
  if [[ -f output-default.html ]]; then
    weasyprint output-default.html output-default.pdf 2>/dev/null
    echo "✓ mkdocs default PDF → output-default.pdf"
  fi

  # Plugin PDF
  if [[ -f output-plugin.html ]]; then
    weasyprint output-plugin.html output-plugin.pdf 2>/dev/null
    echo "✓ mkdocs plugin PDF → output-plugin.pdf"
  fi
else
  echo "⚠ weasyprint not found — skipping PDF generation"
  echo "  Install: pip install weasyprint"
fi
