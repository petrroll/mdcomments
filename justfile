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

# ── VS Code Extension ────────────────────────────────────────

# Compile the VS Code extension TypeScript
vscode-compile:
    cd vscode-mdcomments && npm install --silent && npm run compile

# Package the extension as a .vsix
vscode-package: vscode-compile
    cd vscode-mdcomments && npx @vscode/vsce package --allow-missing-repository --skip-license

# Install the extension into the current VS Code / Codespace
vscode-install: vscode-package
    @vsix=$(ls -t vscode-mdcomments/*.vsix 2>/dev/null | head -n 1); \
    [[ -n "$vsix" ]] || { echo "✗ No .vsix found in vscode-mdcomments/. Run 'just vscode-package' first."; exit 1; }; \
    command -v code >/dev/null 2>&1 || { echo "✗ 'code' CLI not found. In Codespaces Web, use Extensions -> ... -> Install from VSIX and pick $vsix"; exit 1; }; \
    code --install-extension "$vsix" --force
    @echo "Reload VS Code window: Ctrl+Shift+P → Developer: Reload Window"

# One-shot: compile, package, install
vscode: vscode-install
