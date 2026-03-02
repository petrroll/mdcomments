#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")"

echo "=== Comrak ==="
if ! command -v cargo &>/dev/null; then
  echo "⚠ cargo not found — skipping comrak"
  exit 0
fi
cargo build --release 2>&1 | tail -1
./target/release/mdcomments-comrak --default --input ../input.md
./target/release/mdcomments-comrak --plugin  --input ../input.md
echo ""
