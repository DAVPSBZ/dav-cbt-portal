#!/usr/bin/env python3
"""
Build the GitHub Pages version of the portal.

    python tools/build_static.py

Reads  apps-script/Index.html  (the Apps Script page, which contains <?!= ... ?> placeholders) and writes
docs/index.html  - a plain static page that talks to the Apps Script web app through its JSON API (doPost).
The API address is read at run time from docs/config.js (window.DAV_API_URL), so the build never needs it.
Only the Python standard library is used.
"""
import pathlib
import re
import sys

ROOT = pathlib.Path(__file__).resolve().parent.parent
SRC = ROOT / "apps-script" / "Index.html"
OUT = ROOT / "docs" / "index.html"

src = SRC.read_text(encoding="utf-8")

# 1) the five server-side placeholders become values prepared by the loader below
repl = {"cfg": "window.__CFG", "boot": "window.__BOOT", "appUrl": "window.__APP_URL",
        "mode": "window.__MODE", "scanId": "window.__SCAN_ID"}
for key, value in repl.items():
    token = "<?!= %s ?>" % key
    if token not in src:
        sys.exit("placeholder %s not found in Index.html - was the template changed?" % token)
    src = src.replace(token, value)
if "<?" in src:
    sys.exit("an unreplaced Apps Script scriptlet is left in the page")

# 2) <base target="_top"> is only needed inside the Apps Script iframe
src = src.replace('<base target="_top">\n', "").replace('<base target="_top">', "")

# 3) the application script becomes inert text; the loader runs it after the config/boot data has arrived
m = re.search(r"<script>\n(const CFG.*?)</script>", src, re.S)
if not m:
    sys.exit("main <script> block not found")
app_js = m.group(1)
if "</script" in app_js.lower():
    sys.exit("application script contains a closing script tag - cannot be embedded safely")

LOADER = r"""<script>
(function () {
  var API = String(window.DAV_API_URL || '').trim();

  /* google.script.run replacement: every call becomes a POST to the Apps Script web app (JSON API) */
  function call(fn, args) {
    return fetch(API, { method: 'POST', headers: { 'Content-Type': 'text/plain;charset=utf-8' },
                        body: JSON.stringify({ fn: fn, args: args || [] }), redirect: 'follow' })
      .then(function (r) { return r.text(); })
      .then(function (t) {
        var j;
        try { j = JSON.parse(t); } catch (e) { throw new Error('Could not reach the server. Check DAV_API_URL in config.js and that the Apps Script web app is deployed with access "Anyone".'); }
        if (!j.ok) throw new Error(j.error || 'Server error');
        return j.result;
      });
  }
  window.google = { script: { run: (function mk(h) {
    return new Proxy({}, { get: function (_, k) {
      if (k === 'withSuccessHandler') return function (ok) { return mk(Object.assign({}, h, { ok: ok })); };
      if (k === 'withFailureHandler') return function (f) { return mk(Object.assign({}, h, { f: f })); };
      return function () {
        var a = Array.prototype.slice.call(arguments);
        call(k, a).then(function (r) { if (h.ok) h.ok(r); }, function (e) { if (h.f) h.f({ message: e.message }); else console.error(e); });
      };
    } });
  })({}) } };

  var q = new URLSearchParams(location.search);
  window.__MODE = q.get('results') ? 'results' : (q.get('admin') ? 'admin' : '');
  window.__SCAN_ID = q.get('scan') || '';
  window.__APP_URL = location.origin + location.pathname;     /* QR codes on the printed form point here */
  window.__BOOT = null;

  function start() {
    var s = document.createElement('script');
    s.textContent = document.getElementById('app-src').textContent;
    document.body.appendChild(s);
    var sp = document.getElementById('splash'); if (sp) sp.remove();
  }
  if (!API || /PASTE|XXXX/.test(API)) {
    window.__CFG = { error: 'The server address is not set. Open docs/config.js and set DAV_API_URL to your Apps Script web app URL.' };
    start(); return;
  }
  var tasks = [call('getConfigForClient', []).then(function (c) { window.__CFG = c; }).catch(function (e) { window.__CFG = { error: e.message }; })];
  var id = q.get('id');
  if (id) tasks.push(call('getApplicationById', [id]).then(function (b) { window.__BOOT = b; }).catch(function (e) { window.__BOOT = { error: e.message }; }));
  Promise.all(tasks).then(start);
})();
</script>"""

SPLASH_CSS = """
  #splash { position:fixed; inset:0; z-index:999; display:flex; flex-direction:column; align-items:center; justify-content:center; gap:16px; color:#fff; font:600 16px system-ui, sans-serif; background:linear-gradient(160deg,#1e1b4b,#3b2fcc 50%,#8b2fe8); }
  #splash i { width:46px; height:46px; border-radius:50%; border:5px solid rgba(255,255,255,.3); border-top-color:#fff; animation:spin 1s linear infinite; }
  @keyframes spin { to { transform:rotate(360deg); } }
"""

block = '<script type="text/plain" id="app-src">\n' + app_js + '</script>\n' + LOADER
src = src[:m.start()] + block + src[m.end():]
src = src.replace("</style>", SPLASH_CSS + "</style>", 1)
src = src.replace("<body>", '<body>\n<div id="splash"><i></i>Loading application portal&hellip;</div>', 1)
src = src.replace("</head>", '<script src="config.js"></script>\n</head>', 1)

OUT.write_text(src, encoding="utf-8")
print("wrote %s (%d bytes)" % (OUT.relative_to(ROOT), len(src.encode("utf-8"))))
