#!/usr/bin/env bash
# build-default.sh — Build MkDocs site with footnotes + mark (no mdcomments ext).
set -euo pipefail
cd "$(dirname "$0")"

# Copy input.md into docs/
mkdir -p docs
cp ../input.md docs/index.md

# Read default CSS
CSS_CONTENT=$(cat ../shared/style-default.css)

# Build with MkDocs using default config
# We use python-markdown directly since we just need the HTML fragment
python3 -c "
import markdown
import os

with open('docs/index.md') as f:
    text = f.read()

md = markdown.Markdown(extensions=['footnotes', 'pymdownx.mark'])
body = md.convert(text)

css = '''$CSS_CONTENT'''

template = open('../shared/template.html').read()
html = template.replace('{{TITLE}}', 'mdcomments — MkDocs/Python-Markdown (default)')
html = html.replace('{{CSS}}', f'<style>{css}</style>')
html = html.replace('{{BODY}}', body)

with open('output-default.html', 'w') as f:
    f.write(html)
print('✓ mkdocs default → output-default.html')
"
