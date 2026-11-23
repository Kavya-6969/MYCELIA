#!/usr/bin/env python3
"""One-off port: mycelia-landing/index.html -> homepage layer inside public/index.html (idempotent: replaces <!--HOME--> blocks)."""
import re, sys
SRC = '/home/claude/mycelia-landing/index.html'
APP = '/home/claude/researchgraph/public/index.html'
L = open(SRC).read()

css = L[L.index('<style>') + 7:L.index('</style>')]
html = L[L.index('</style>') + 8:L.index('<div class="ws" id="ws"')]
js = L[L.index("<script>\ndocument.documentElement.classList.add('js');") + 9:L.rindex('</script>')]
three = '<script src="https://cdnjs.cloudflare.com/ajax/libs/three.js/r128/three.min.js"></script>'
assert three in L

IDS = ['top', 'how', 'canvas-demo', 'tech', 'ideas', 'start', 'gl', 'fogA', 'fogB', 'menuBtn', 'mnav', 'wCount', 'wStatus', 'wBar', 'stage', 'mk', 'arr', 'rough', 'rg1', 'rg2']

# ---------------- CSS ----------------
a = css.index('/* ---------- buttons'); b = css.index('/* ---------- workspace overlay'); c = css.index('/* ---------- responsive')
body = css[a:b] + css[c:]
body = body.replace("  .ws-h .sub { display: none; }\n", '').replace("  .ws, .ws.open { transition: none; }\n", '')
uri = re.search(r'url\("data:[^"]*"\)', body).group(0); body = body.replace(uri, '@@URI@@')
body = re.sub(r'(?<!\d)\.(?=[a-zA-Z])([a-zA-Z][\w-]*)', r'.h-\1', body)
body = body.replace('#gl', '#hm-gl').replace('@@URI@@', uri)
body = body.replace('.h-hero { position: relative;', '.h-hero { position: relative; z-index: 0;', 1)
base = """/* ============ Homepage (landing) layer. Every class is prefixed h-, every id hm-, so nothing touches the workspace styles. ============ */
#home {
  color-scheme: dark; --obs: #0A0A0A; --char: #1A1A1A; --fog: #6E7175; --fog-2: #8D9196; --white: #FFFFFF;
  --paper: #8b5cf6; --dataset: #10b981; --code: #38bdf8; --note: #f59e0b; --exp: #f43f5e; --core: #6366f1;
  --line: rgba(255,255,255,.11); --line-2: rgba(255,255,255,.2);
  --sans: 'Inter', ui-sans-serif, system-ui, -apple-system, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;
  --mono: ui-monospace, 'SF Mono', SFMono-Regular, Menlo, Consolas, 'Liberation Mono', monospace;
  --gut: max(16px, env(safe-area-inset-left, 0px)); --gutr: max(16px, env(safe-area-inset-right, 0px));
  position: fixed; inset: 0; z-index: 1000; overflow-y: auto; overflow-x: hidden; overscroll-behavior: contain; scroll-behavior: smooth;
  background: var(--obs); color: #fff; font-family: var(--sans); font-size: 16px; line-height: 1.55; letter-spacing: normal; text-align: left; -webkit-font-smoothing: antialiased;
}
#home.h-off { visibility: hidden; pointer-events: none; }
@@W@@ *, @@W@@ *::before, @@W@@ *::after { box-sizing: border-box; }
@@W@@ a { color: inherit; text-decoration: none; }
@@W@@ button { font: inherit; color: inherit; letter-spacing: inherit; }
@@W@@ :focus-visible { outline: 2px solid #fff; outline-offset: 3px; border-radius: 6px; }
@@W@@ h1, @@W@@ h2, @@W@@ h3, @@W@@ p { margin: 0; }
@@W@@ section[id], @@W@@ header[id] { scroll-margin-top: 20px; }
@@W@@ ol { list-style: none; margin: 0; padding: 0; }
.h-wrap { width: 100%; max-width: 1240px; margin: 0 auto; padding-left: var(--gut); padding-right: var(--gutr); }
.h-sr { position: absolute; width: 1px; height: 1px; overflow: hidden; clip: rect(0 0 0 0); white-space: nowrap; }
.h-mk { width: 28px; height: 28px; display: block; flex: none; }
.h-eyebrow { font-family: var(--mono); font-size: .72rem; letter-spacing: .22em; text-transform: uppercase; color: var(--fog-2); margin-bottom: 18px; }
h2.h-t { font-size: clamp(2rem, 4.6vw, 3.6rem); font-weight: 600; letter-spacing: -.045em; line-height: 1.04; text-wrap: balance; }
.h-lead { margin-top: 18px; max-width: 620px; color: rgba(255,255,255,.66); font-size: clamp(1rem, 1.4vw, 1.12rem); text-wrap: pretty; }
.h-sec { position: relative; padding: clamp(80px, 11vw, 150px) 0; }
.h-sec + .h-sec { border-top: 1px solid rgba(255,255,255,.05); }
.h-sec-head { margin-bottom: clamp(36px, 5vw, 64px); }
"""
# drop the original base up to the buttons block (already sliced), keep prefixed rest
base = base.replace('@@W@@', ':where(#home)')
body = body.replace('h1.hl', 'h1.h-hl').replace('h2.t ', 'h2.h-t ').replace('h2.t{', 'h2.h-t{')
css_out = base + body
css_out += "\n.topbar .brand-logo, .topbar .brand-name { cursor: pointer; }\n.topbar .brand-name:hover { color: #fff; text-shadow: 0 0 14px rgba(139,92,246,.6); }\n"

# ---------------- HTML ----------------
def pref(m):
    return 'class="' + ' '.join('h-' + t for t in m.group(1).split()) + '"'
html = re.sub(r'class="([^"]*)"', pref, html)
for i in IDS:
    for pat, rep in ((f'id="{i}"', f'id="hm-{i}"'), (f'href="#{i}"', f'href="#hm-{i}"'), (f'aria-controls="{i}"', f'aria-controls="hm-{i}"'), (f'url(#{i})', f'url(#hm-{i})')):
        html = html.replace(pat, rep)
html = html.replace('data-open', 'data-hm-open')
# brand mark = the workspace's own logo, monochrome
sym = re.search(r'<symbol id="hm-mk".*?</symbol>', html, re.S).group(0)
new_sym = '<symbol id="hm-mk" viewBox="0 0 24 24"><g fill="none" stroke="currentColor" stroke-width="1.2" stroke-linejoin="round"><rect x=".6" y=".6" width="22.8" height="22.8" rx="6"/><path d="M8 8.2 16.5 10 10 16.5Z"/></g><g fill="currentColor"><circle cx="8" cy="8" r="2"/><circle cx="16.5" cy="10" r="2"/><circle cx="10" cy="16.5" r="2"/></g></symbol>'
html = html.replace(sym, new_sym)
html = html.replace('<!-- Placeholder mark: an original mycelium network. Swap this one symbol for your own logo (viewBox 0 0 100 75). -->', '<!-- Brand mark: the same mark as the workspace top bar. -->')
html = html.replace('<main>', '<main>').strip()
# the hero header: anchors in nav stay as hash links, handled in JS (no hash pollution)
html = html.replace('<a class="h-brand" href="#hm-top"', '<a class="h-brand" href="#hm-top"')
home_html = '<div id="home" class="h-js" role="region" aria-label="mycelia home">\n' + html + '\n</div>\n<script>if(/^#(workspace|canvas)$/.test(location.hash))document.getElementById("home").classList.add("h-off");</script>\n'

# ---------------- JS ----------------
s0 = js.index('  /* ---------- workspace overlay'); s1 = js.index('  /* ---------- live canvas section')
pre, post = js[:s0], js[s1:]
mid = """  /* ---------- helpers for the live canvas ---------- */
  var NS = 'http://www.w3.org/2000/svg', dashOff = 0;
  function mk(tag, attrs, parent) { var e = document.createElementNS(NS, tag); for (var k in attrs) e.setAttribute(k, attrs[k]); if (parent) parent.appendChild(e); return e; }

  /* ---------- enter / leave the real workspace ---------- */
  var home = $('#home'), shell = document.querySelector('.shell'), state = home.classList.contains('h-off') ? 'app' : 'home', anim = 0, running = false;
  function setMask(x, y, r) { var m = 'radial-gradient(circle at ' + x + 'px ' + y + 'px, transparent ' + r + 'px, #000 ' + (r + 1) + 'px)'; home.style.webkitMaskImage = m; home.style.maskImage = m; }
  function clearMask() { home.style.webkitMaskImage = ''; home.style.maskImage = ''; }
  function origin(src) { var x = innerWidth / 2, y = innerHeight / 2; if (src && src.getBoundingClientRect) { var r = src.getBoundingClientRect(); x = r.left + r.width / 2; y = r.top + r.height / 2; } return { x: x, y: y, R: Math.hypot(Math.max(x, innerWidth - x), Math.max(y, innerHeight - y)) + 4 }; }
  function sweep(o, from, to, done) {
    cancelAnimationFrame(anim);
    if (RM) { done(); return; }
    var t0 = 0;
    (function step(t) { if (!t0) t0 = t; var p = clamp((t - t0) / 900, 0, 1), e = p < .5 ? 4 * p * p * p : 1 - Math.pow(-2 * p + 2, 3) / 2; setMask(o.x, o.y, from + (to - from) * e); if (p < 1) anim = requestAnimationFrame(step); else done(); })(performance.now());
  }
  function enter(src) {
    if (state !== 'home') return; state = 'entering';
    var o = origin(src); shell.removeAttribute('inert');
    try { if (location.hash !== '#workspace') location.hash = 'workspace'; } catch (e) {}
    setMask(o.x, o.y, 0);
    sweep(o, 0, o.R, function () {
      clearMask(); home.classList.add('h-off'); home.setAttribute('inert', ''); home.setAttribute('aria-hidden', 'true'); state = 'app';
      var f = document.getElementById('btnAdd'); if (f) f.focus({ preventScroll: true });
    });
  }
  function show(src) {
    if (state !== 'app') return; state = 'leaving';
    var o = origin(src); setMask(o.x, o.y, o.R); home.scrollTop = 0;
    home.classList.remove('h-off'); home.removeAttribute('inert'); home.removeAttribute('aria-hidden'); shell.setAttribute('inert', '');
    try { if (/^#(workspace|canvas)$/.test(location.hash)) history.replaceState(null, '', location.pathname + location.search); } catch (e) { try { location.hash = ''; } catch (e2) {} }
    start();
    sweep(o, o.R, 0, function () { clearMask(); state = 'home'; var f = home.querySelector('[data-hm-open]'); if (f) f.focus({ preventScroll: true }); });
  }
  $$('[data-hm-open]', home).forEach(function (b) { b.addEventListener('click', function () { enter(b); }); });
  window.addEventListener('hashchange', function () {
    var w = /^#(workspace|canvas)$/.test(location.hash);
    if (w && state === 'home') enter(null); else if (!w && state === 'app') show(null);
  });
  /* while the homepage covers the workspace, keyboard shortcuts must not reach it */
  window.addEventListener('keydown', function (e) { if (state === 'app') return; if (e.key === 'Escape' && mnav.classList.contains('open')) { setMenu(false); menuBtn.focus(); } e.stopPropagation(); }, true);
  /* in-page links scroll the homepage without touching the URL */
  $$('a[href^="#hm-"]', home).forEach(function (a) { a.addEventListener('click', function (e) { var t = document.getElementById(a.getAttribute('href').slice(1)); if (!t) return; e.preventDefault(); setMenu(false); t.scrollIntoView({ behavior: RM ? 'auto' : 'smooth', block: 'start' }); }); });
  if (state === 'home') shell.setAttribute('inert', '');
  window.MyceliaHome = { show: show, enter: enter, state: function () { return state; } };

"""
js2 = pre + mid + post
# drop the old keydown-Escape for menu (merged above) and the old data-open wiring lives in the removed block
js2 = js2.replace("  window.addEventListener('keydown', function (e) { if (e.key === 'Escape' && mnav.classList.contains('open')) { setMenu(false); menuBtn.focus(); } });\n", '')
js2 = js2.replace("document.documentElement.classList.add('js');\n", '')
# ids
for i in ['menuBtn', 'mnav', 'wStatus', 'wBar', 'wCount', 'stage', 'gl', 'top', 'fogA', 'fogB']:
    js2 = js2.replace("'#" + i + "'", "'#hm-" + i + "'")
js2 = js2.replace("$('#mnav')", "$('#hm-mnav')").replace("$$('#mnav a')", "$$('#hm-mnav a')")
js2 = js2.replace("var menuBtn = $('#hm-menuBtn'), mnav = $('#hm-mnav');", "var menuBtn = $('#hm-menuBtn'), mnav = $('#hm-mnav');")
# classes
rep = [("mnav.classList.toggle('open', o)", "mnav.classList.toggle('h-open', o)"), ("mnav.classList.contains('open')", "mnav.classList.contains('h-open')"),
       ("$$('.rv')", "$$('.h-rv')"), ("classList.add('in')", "classList.add('h-in')"), ("$$('.card')", "$$('.h-card')"), ("$('.gl', c)", "$('.h-gl', c)"),
       ("orb.className = 'orb'", "orb.className = 'h-orb'"), ('<div class="glow"></div><div class="ring"></div><div class="core"></div>', '<div class="h-glow"></div><div class="h-ring"></div><div class="h-core"></div>'),
       ("$('.ring', orb)", "$('.h-ring', orb)"), ("$('.glow', orb)", "$('.h-glow', orb)"), ("className = 'snip'", "className = 'h-snip'"), ("className = 'ncard'", "className = 'h-ncard'"),
       ('<div class="ty"></div><div class="ti"></div>', '<div class="h-ty"></div><div class="h-ti"></div>'), ("$('.ty', d.cd_el)", "$('.h-ty', d.cd_el)"), ("$('.ti', d.cd_el)", "$('.h-ti', d.cd_el)"),
       ("'class': 'lk'", "'class': 'h-lk'"), ("classList.add('no-gl')", "classList.add('h-no-gl')"), ("classList.add('drag')", "classList.add('h-drag')"), ("classList.remove('drag')", "classList.remove('h-drag')")]
for a_, b_ in rep:
    assert a_ in js2, a_
    js2 = js2.replace(a_, b_)
# scope the document-wide queries used by the homepage to the homepage root
# main loop: stop when the homepage is hidden, restart on show()
old_loop = js2[js2.index('  /* ---------- one animation loop'):]
new_loop = """  /* ---------- one animation loop (idle while the workspace is showing) ---------- */
  var last = performance.now();
  function frame(t) {
    if (state === 'app') { running = false; return; }
    var dt = Math.min(.1, (t - last) / 1000); last = t;
    if (heroVis) { if (!RM) { fogA.style.transform = 'translate3d(' + (Math.sin(t * .00005) * 7).toFixed(2) + '%,0,0)'; fogB.style.transform = 'translate3d(' + (Math.cos(t * .00004) * -8).toFixed(2) + '%,0,0)'; } if (gl) gl(t, dt); }
    dashOff += dt * 22;
    if (stageVis) updateStage(t, dt);
    requestAnimationFrame(frame);
  }
  function start() { if (running) return; running = true; last = performance.now(); requestAnimationFrame(frame); }
  if (state !== 'app') start();
})();
"""
js2 = js2.replace(old_loop, new_loop)
# the frame loop references start() before definition inside show(): function declarations hoist, fine.
home_js = '<script>\n' + js2.strip() + '\n</script>\n'

# ---------------- write into app ----------------
app = open(APP).read()
app = re.sub(r'/\*HOME-CSS\*/.*?/\*/HOME-CSS\*/\n?', '', app, flags=re.S)
app = re.sub(r'<!--HOME-HTML-->.*?<!--/HOME-HTML-->\n?', '', app, flags=re.S)
app = re.sub(r'<!--HOME-JS-->.*?<!--/HOME-JS-->\n?', '', app, flags=re.S)
i = app.rindex('</style>')
app = app[:i] + '/*HOME-CSS*/\n' + css_out + '\n/*/HOME-CSS*/\n' + app[i:]
j = app.index('<div class="shell">')
app = app[:j] + '<!--HOME-HTML-->\n' + home_html + '<!--/HOME-HTML-->\n' + app[j:]
k = app.rindex('</script>') + len('</script>')
app = app[:k] + '\n<!--HOME-JS-->\n' + three + '\n' + home_js + '<!--/HOME-JS-->\n' + app[k:]
open(APP, 'w').write(app)
print('ported:', len(css_out), 'css,', len(home_html), 'html,', len(home_js), 'js')
