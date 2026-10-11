"""Stamp the page's CSS/JS links with a hash of each file's contents (style.css?v=1a2b3c4d).

GitHub Pages lets browsers cache files for 10 minutes, so after an update a visitor could get
the new page with old scripts. A changed file gets a new ?v=, so browsers fetch it fresh.
Run this after editing anything in css/, js/ or vendor/:  python tools/stamp_assets.py
"""
import hashlib, pathlib, re

root = pathlib.Path(__file__).resolve().parent.parent
page = root / "index.html"
html = page.read_text(encoding="utf-8")

def stamp(match):
    attr, path = match.group(1), match.group(2)
    digest = hashlib.sha256((root / path).read_bytes()).hexdigest()[:8]
    return f'{attr}="{path}?v={digest}"'

new = re.sub(r'(src|href)="((?:css|js|vendor)/[^"?]+)(?:\?v=[0-9a-f]+)?"', stamp, html)
if new != html:
    page.write_text(new, encoding="utf-8")
    print("index.html: asset versions updated")
else:
    print("index.html: already up to date")
