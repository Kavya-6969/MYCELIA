#!/usr/bin/env python3
"""Inline every /*-core.js script from src/ into public/index.html -> dist/artifact.html (one self-contained file)."""
import os, re
root = os.path.dirname(os.path.abspath(__file__))
html = open(f'{root}/public/index.html').read()
html = re.sub(r'<!--STANDALONE-->.*?<!--/STANDALONE-->\n?', '', html, flags=re.S)
def inline(m):
    return '<script>\n' + open(f'{root}/src/{m.group(1)}.js').read() + '\n</script>'
html = re.sub(r'<script src="/([a-z-]+-core)\.js"></script>', inline, html)
def inline_vendor(m):
    return '<script>\n' + open(f'{root}/public/vendor/{m.group(1)}').read() + '\n</script>'
html = re.sub(r'<script src="/vendor/([^"]+)"></script>', inline_vendor, html)
assert 'src="/' not in html, 'unresolved script tag'
os.makedirs(f'{root}/dist', exist_ok=True)
open(f'{root}/dist/artifact.html', 'w').write(html)
print('built dist/artifact.html', round(len(html) / 1024), 'KB')
