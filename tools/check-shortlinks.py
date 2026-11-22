#!/usr/bin/env python3
"""Check the short client links (/promo, /live, /info, /rep) against a base URL.

Usage: python3 tools/check-shortlinks.py [BASE]   (default https://luxuryband.ru)
Redirects are NOT followed: each short link must answer 301/302 with the exact
target; the embed targets are then fetched and must be 200 text/html, noindex,
and the mp4 they point at must answer 200 video/mp4. Exit code 1 on any failure.
"""
import sys
import urllib.error
import urllib.parse
import urllib.request

BASE = (sys.argv[1] if len(sys.argv) > 1 else "https://luxuryband.ru").rstrip("/")
UA = {"User-Agent": "lcb-shortlinks-check/1"}
EXPECT = {
    "/promo": ("/embed/", "/assets/video/mp4/promo-main-reel-4ef6085a27d4-"),
    "/live": ("/embed/", "/assets/video/mp4/live-icon-c970843de9c5-"),
    "/info": ("https://drive.google.com/drive/folders/", None),
    "/rep": ("https://docs.google.com/document/d/", None),
}


class NoRedirect(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, *a, **k):
        return None


opener = urllib.request.build_opener(NoRedirect)
fails = []


def get(url, method="GET"):
    req = urllib.request.Request(url, method=method, headers=UA)
    try:
        r = opener.open(req, timeout=20)
    except urllib.error.HTTPError as e:
        r = e
    body = r.read(200000) if method == "GET" and "text" in (r.headers.get("Content-Type") or "") else b""
    return r.status, r.headers, body


def check(ok, msg):
    print(("ok   " if ok else "FAIL ") + msg)
    if not ok:
        fails.append(msg)


for path, (target, media) in EXPECT.items():
    for variant in (path, path + "/"):
        status, h, _ = get(BASE + variant, "HEAD")
        loc = h.get("Location") or ""
        check(status in (301, 302), f"{variant}: status {status} (want 301/302)")
        if BASE.startswith("https://luxuryband.ru"):
            check(loc.startswith(target.replace("/embed/", "https://luxuryband.ru/embed/")), f"{variant}: Location {loc[:90]}")
        else:
            check(target in loc, f"{variant}: Location {loc[:90]}")
        check("http://" not in loc.split("?")[0][:8], f"{variant}: Location is not plain http")
    if not media:
        continue
    q = urllib.parse.urlparse(loc)
    src = urllib.parse.parse_qs(q.query).get("src", [""])[0]
    check(src.startswith(media) and src.endswith(".mp4"), f"{path}: src={src}")
    status, h, body = get(BASE + q.path + "?" + q.query)
    html = body.decode("utf-8", "replace")
    check(status == 200 and "text/html" in (h.get("Content-Type") or ""), f"{path}: embed page {status} {h.get('Content-Type')}")
    check('name="robots" content="noindex"' in html, f"{path}: embed page is noindex")
    check('property="og:title"' in html and 'property="og:image"' in html, f"{path}: embed page has og tags (needs the deploy of this change)")
    status, h, _ = get(BASE + src, "HEAD")
    check(status == 200 and "video/mp4" in (h.get("Content-Type") or ""), f"{path}: mp4 {status} {h.get('Content-Type')}")

# the retired gallery file must not be indexed or shadow the rewrite
status, h, body = get(BASE + "/live/index.html", "HEAD")
check(status in (200, 301, 302), f"/live/index.html: {status}")
print("RESULT:", "FAIL" if fails else "PASS")
sys.exit(1 if fails else 0)
