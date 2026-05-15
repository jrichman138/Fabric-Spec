#!/usr/bin/env bash
# Mirrors fabrics.md into the <script type="text/markdown" id="fabrics-data"> block in index.html.
# Run this whenever fabrics.md changes. fabrics.md remains the canonical source.

set -euo pipefail
cd "$(dirname "$0")"

[[ -f fabrics.md ]]   || { echo "fabrics.md not found"; exit 1; }
[[ -f index.html ]]   || { echo "index.html not found"; exit 1; }

python3 - <<'PY'
import re, pathlib

html = pathlib.Path('index.html').read_text()
md   = pathlib.Path('fabrics.md').read_text()

start = '<script type="text/markdown" id="fabrics-data">'
end   = '</script>'

i = html.find(start)
if i < 0:
    raise SystemExit('Could not find <script id="fabrics-data"> in index.html')
j = html.find(end, i)
if j < 0:
    raise SystemExit('Unclosed <script id="fabrics-data">')

new = html[:i + len(start)] + '\n' + md.rstrip() + '\n  ' + html[j:]
pathlib.Path('index.html').write_text(new)
print('Synced fabrics.md → index.html')
PY
