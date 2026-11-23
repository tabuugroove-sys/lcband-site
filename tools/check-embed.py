#!/usr/bin/env python3
"""Check the /embed/ player playlist (previous/next arrows + «watch next» end screen).

Usage: python3 tools/check-embed.py [BASE] [MEDIA_BASE]
  BASE        site that serves /embed/ and the posters (default https://luxuryband.ru;
              use http://localhost:8123 for a local `_site` served with python -m http.server)
  MEDIA_BASE  where the mp4 files live (default https://luxuryband.ru: heavy video is not in git)

Checks: the embed page has the arrows, the end screen, noindex and og tags; the playlist
JSON is valid, starts with the promo reel then the live video; every item's mp4 (720 and
1080) answers 200 video/mp4 and its posters (-720/-1080 webp) answer 200 image/webp; and,
when run inside the repo, the poster / international flags agree with src/_data
(videoPosters.json, internationalMedia.json). Exit code 1 on any failure.
"""
import json
import pathlib
import re
import sys
import urllib.error
import urllib.request

BASE = (sys.argv[1] if len(sys.argv) > 1 else "https://luxuryband.ru").rstrip("/")
MEDIA = (sys.argv[2] if len(sys.argv) > 2 else "https://luxuryband.ru").rstrip("/")
UA = {"User-Agent": "lcb-embed-check/1"}
ROOT = pathlib.Path(__file__).resolve().parent.parent
fails = []


def request(url, method="GET", limit=400000):
    req = urllib.request.Request(url, method=method, headers=UA)
    try:
        r = urllib.request.urlopen(req, timeout=30)
    except urllib.error.HTTPError as e:
        r = e
    body = r.read(limit) if method == "GET" else b""
    return r.status, r.headers.get("Content-Type") or "", body


def check(ok, msg):
    print(("ok   " if ok else "FAIL ") + msg)
    if not ok:
        fails.append(msg)


# 1. the page
status, ctype, body = request(BASE + "/embed/?src=/assets/video/mp4/promo-main-reel-4ef6085a27d4-2160.mp4&title=Luxury+Band")
html = body.decode("utf-8", "replace")
check(status == 200 and "text/html" in ctype, f"/embed/ page {status} {ctype}")
check('name="robots" content="noindex"' in html, "embed page is noindex")
check('property="og:title"' in html and 'property="og:image"' in html and 'property="og:description"' in html, "embed page keeps og tags")
for needle, what in (('id="prev"', "previous arrow"), ('id="next"', "next arrow"), ('id="end"', "end screen"), ('id="again"', "replay button"),
                     ("/embed/playlist.json", "playlist fetch"), ("'ended'", "ended handler"), ("ArrowLeft", "keyboard arrows"), ("touchend", "swipe")):
    check(needle in html, f"embed page has {what}")

# 2. the playlist
status, ctype, body = request(BASE + "/embed/playlist.json")
check(status == 200, f"playlist.json {status} {ctype}")
try:
    items = json.loads(body)["items"]
except Exception as e:  # noqa: BLE001
    print("FAIL playlist.json is not valid JSON:", e)
    sys.exit(1)
check(len(items) >= 7, f"playlist has {len(items)} videos (need >= 7: current + 6 tiles)")
check([i["slug"] for i in items[:2]] == ["promo-main-reel", "live-icon"], "order starts with the promo reel, then the live video")
check(len({i["slug"] for i in items}) == len(items), "no duplicate slugs")
check(sum(1 for i in items if i.get("intl")) >= 7, "enough international (lang!=ru) videos for the end screen")
for i in items:
    check(bool(i.get("title")) and (not i.get("intl") or bool(i.get("titleEn"))), f"{i['slug']}: titles")

# 3. families (the same mapping the site uses: promo-media.js, else the plain slug)
status, _, body = request(BASE + "/promo-media.js")
families = {}
if status == 200:
    m = re.search(r"=\s*(\{.*\});?\s*$", body.decode("utf-8", "replace"), re.S)
    if m:
        families = {k: v.get("family") for k, v in json.loads(m.group(1)).items()}
check(bool(families), f"promo-media.js parsed ({len(families)} families)")

# 4. files
for i in items:
    family = families.get(i["slug"]) or i["slug"]
    for q in (720, 1080):
        status, ctype, _ = request(f"{MEDIA}/assets/video/mp4/{family}-{q}.mp4", "HEAD")
        check(status == 200 and "video/mp4" in ctype, f"{i['slug']}: mp4 {family}-{q} {status} {ctype}")
    for poster in {i["poster"], i.get("posterIntl", i["poster"])}:
        for size in (720, 1080):
            status, ctype, _ = request(f"{BASE}/assets/video/posters/{poster}-{size}.webp", "HEAD")
            check(status == 200 and "image/webp" in ctype, f"{i['slug']}: poster {poster}-{size}.webp {status}")

# 5. agreement with the site data (only when run inside the repo)
data = ROOT / "src" / "_data"
if (data / "videoPosters.json").exists() and (data / "internationalMedia.json").exists():
    vp = json.loads((data / "videoPosters.json").read_text())
    im = json.loads((data / "internationalMedia.json").read_text())
    allowed = set(im["allowedVideos"])
    for i in items:
        slug = i["slug"]
        check(bool(i.get("intl")) == (slug in allowed), f"{slug}: intl flag matches internationalMedia.allowedVideos")
        ru = vp["ru"].get(slug) or vp["all"].get(slug)
        if ru:
            check(i["poster"] == ru, f"{slug}: poster {i['poster']} == videoPosters ru/all {ru}")
        if slug in allowed:
            intl = im["posterOverrides"].get(slug) or vp["all"].get(slug) or slug
            check(i.get("posterIntl", i["poster"]) == intl, f"{slug}: international poster is {intl}")

print("RESULT:", "FAIL" if fails else "PASS")
sys.exit(1 if fails else 0)
