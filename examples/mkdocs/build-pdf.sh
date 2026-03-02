#!/usr/bin/env bash
# build-pdf.sh — Generate PDF from the MkDocs/Python-Markdown output.
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

# Default PDF
if [[ -f output-default.html ]]; then
  weasyprint output-default.html output-default.pdf 2>/dev/null
  echo "✓ mkdocs default PDF → output-default.pdf"
fi

# Plugin PDF — use the default HTML (clean layout) as the base PDF,
# then overlay comment threads as native PDF annotations.
if [[ -f output-default.html ]]; then
  weasyprint output-default.html /tmp/mdcomments-mkdocs-plugin-base.pdf 2>/dev/null
  python3 "$ADD_COMMENTS" "$INPUT" \
    /tmp/mdcomments-mkdocs-plugin-base.pdf \
    output-plugin.pdf
  echo "✓ mkdocs plugin PDF (weasyprint + PDF annotations) → output-plugin.pdf"
fi
