#!/usr/bin/env bash
# build-plugin.sh — Build with mdcomments Python-Markdown extension.
set -euo pipefail
cd "$(dirname "$0")"

mkdir -p docs
cp ../input.md docs/index.md

# Add the extension directory to Python path
export PYTHONPATH="${PWD}:${PYTHONPATH:-}"

python3 -c "
import sys
import markdown

with open('docs/index.md') as f:
    text = f.read()

md = markdown.Markdown(extensions=['footnotes', 'pymdownx.mark', 'mdcomments_ext'])
body = md.convert(text)

template = open('../shared/template.html').read()
html = template.replace('{{TITLE}}', 'mdcomments — MkDocs/Python-Markdown (plugin)')
html = html.replace('{{CSS}}', '')  # CSS is injected by the extension
html = html.replace('{{BODY}}', body)

with open('output-plugin.html', 'w') as f:
    f.write(html)
print('✓ mkdocs plugin → output-plugin.html')
"
