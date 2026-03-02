#!/usr/bin/env bash
# build-all.sh — Build all mdcomments cross-parser examples.
#
# Prerequisites:
#   node, npm     — for markdown-it and showdown
#   pandoc        — for pandoc examples
#   python3, pip  — for MkDocs / Python-Markdown
#   cargo (Rust)  — for comrak
#   weasyprint    — (optional) for PDF generation
#
# Outputs are written into each system's subdirectory:
#   {system}/output-default.html    Default rendering (no mdcomments awareness)
#   {system}/output-plugin.html     Plugin-enhanced rendering (comment sidebar)
#   {system}/output-*.pdf           PDF outputs (Pandoc, MkDocs only)
#
# Then copied into dist/ for the results viewer.

set -euo pipefail
cd "$(dirname "$0")"

echo "╔══════════════════════════════════════════════════════════════╗"
echo "║       mdcomments — Cross-Parser Examples Builder            ║"
echo "╚══════════════════════════════════════════════════════════════╝"
echo ""

# ── Check prerequisites ──
MISSING=""
command -v node    &>/dev/null || MISSING="$MISSING node"
command -v npm     &>/dev/null || MISSING="$MISSING npm"
command -v pandoc  &>/dev/null || MISSING="$MISSING pandoc"
command -v python3 &>/dev/null || MISSING="$MISSING python3"
command -v cargo   &>/dev/null || MISSING="$MISSING cargo"

if [[ -n "$MISSING" ]]; then
  echo "⚠ Missing prerequisites:$MISSING"
  echo "  Some examples may fail. Continuing anyway..."
  echo ""
fi

ERRORS=0

# ── Build each system ──
for system in markdown-it pandoc mkdocs showdown comrak; do
  if [[ -f "$system/build.sh" ]]; then
    if ! bash "$system/build.sh"; then
      echo "✗ $system build failed"
      ERRORS=$((ERRORS + 1))
    fi
  else
    echo "⚠ $system/build.sh not found — skipping"
  fi
done

# ── Assemble dist/ ──
echo "=== Assembling dist/ ==="
rm -rf dist
mkdir -p dist

# Copy results viewer
cp results.html dist/

# Copy shared assets
mkdir -p dist/shared
cp shared/*.css dist/shared/

# Copy per-system outputs
for system in markdown-it pandoc mkdocs showdown comrak; do
  if [[ -d "$system" ]]; then
    mkdir -p "dist/$system"
    # Copy HTML outputs
    for f in "$system"/output-*.html; do
      [[ -f "$f" ]] && cp "$f" "dist/$system/"
    done
    # Copy PDF outputs
    for f in "$system"/output-*.pdf; do
      [[ -f "$f" ]] && cp "$f" "dist/$system/"
    done
  fi
done

echo ""
echo "═══════════════════════════════════════════════════════════════"
if [[ $ERRORS -eq 0 ]]; then
  echo "✓ All builds complete. Open dist/results.html in a browser."
else
  echo "⚠ $ERRORS build(s) had errors. Check output above."
fi
echo "═══════════════════════════════════════════════════════════════"
