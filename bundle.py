#!/usr/bin/env python3
"""Bundle index.html + style.css + app.js + data.json into one self-contained
HTML file at /workspace/site/bundled.html.

Needed for staticrypt, which encrypts a single HTML page. External
style/script/json would otherwise stay unprotected URLs.

Run after build.py:
    python3 build.py && python3 bundle.py
    # then: staticrypt bundled.html -p "YOUR_PASSWORD" -d protected
"""
import json
from pathlib import Path

HERE = Path(__file__).resolve().parent

html  = (HERE / "index.html").read_text()
css   = (HERE / "style.css").read_text()
js    = (HERE / "app.js").read_text()
data  = (HERE / "data.json").read_text()

# Swap the <link rel="stylesheet" ...> with inline <style>
html = html.replace(
    '<link rel="stylesheet" href="./style.css">',
    f"<style>\n{css}\n</style>"
)

# Replace `fetch('./data.json')` with a reference to an embedded JSON script tag
js = js.replace(
    'const r = await fetch("./data.json");\n    state.data = await r.json();',
    'state.data = JSON.parse(document.getElementById("__data__").textContent);'
)

# Embed data.json as a <script type="application/json">, and replace the
# external <script src="./app.js"> with inline JS.
inline_block = (
    f'<script id="__data__" type="application/json">{data}</script>\n'
    f'<script>\n{js}\n</script>'
)
html = html.replace('<script src="./app.js"></script>', inline_block)

out = HERE / "bundled.html"
out.write_text(html)
print(f"wrote {out}  ({out.stat().st_size // 1024} KB)")
