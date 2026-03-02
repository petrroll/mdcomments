# justfile — mdcomments task runner

set shell := ["bash", "-euo", "pipefail", "-c"]

npm_dirs := "examples/markdown-it examples/showdown"

# ── Installation ──────────────────────────────────────────────

# Install all dependencies (npm, pip, cargo, serve)
install: _install-npm _install-pip _install-rust _install-serve

_install-npm:
    @for dir in {{ npm_dirs }}; do \
        echo "npm install ($dir)"; \
        (cd "$dir" && npm install --silent 2>/dev/null); \
    done

_install-pip:
    @echo "pip install (mkdocs)"
    pip install -q -r examples/mkdocs/requirements.txt

_install-rust:
    @if ! command -v cargo &>/dev/null; then \
        echo "Installing Rust via rustup"; \
        curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh -s -- -y 2>&1 | tail -3; \
        source "$HOME/.cargo/env"; \
    fi
    @echo "cargo build (comrak)"
    cd examples/comrak && cargo build --release 2>&1 | tail -1

_install-serve:
    npm install -g serve

# ── Build & Serve ─────────────────────────────────────────────

# Build all cross-parser examples and assemble dist/
build-examples:
    bash examples/build-all.sh

# Serve the built examples locally
serve: build-examples
    @command -v serve &>/dev/null || { echo "✗ 'serve' not found — run 'just install' first."; exit 1; }
    @echo "Serving ./ at http://localhost:3000 …"
    serve ./
