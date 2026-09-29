"""Build the downloadable promo from the current page assets; keep media outside Git.
Usage: python3 tools/build-erhu-promo.py /tmp/erhu-promo.zip
Commit media/erhu-promo.json, upload the matching ZIP to its URL, then deploy HTML.
"""
import hashlib
import json
import sys
import urllib.request
import zipfile
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
output = Path(sys.argv[1])
video_manifest = {f['path']: f for f in json.loads((ROOT/'media/manifest.json').read_text())['files']}
videos = [{'title': 'Дождь в Цзяннани', 'url': '/assets/video/mp4/erhu-01-rain.mp4'}] + json.loads((ROOT/'src/_data/erhuVideos.json').read_text())
photos = json.loads((ROOT/'src/_data/erhuPhotos.json').read_text())
items = [(v['url'], f'Видео/{i:02d} — {v["title"]}.mp4') for i,v in enumerate(videos,1)]
items += [(f'/assets/erhu/photos/erhu-{p["id"]}-960.webp', f'Фото/{i:02d} — {p["title"]}.webp') for i,p in enumerate(photos,1)]
items += [('/assets/erhu/repertoire.txt', 'Репертуар.txt')]

def fetch(item):
    url, name = item
    data = urllib.request.urlopen('https://luxuryband.ru'+url, timeout=180).read()
    digest = hashlib.sha256(data).hexdigest()
    expected = video_manifest.get(url.lstrip('/'))
    if expected:
        assert digest == expected['sha256'] and len(data) == expected['bytes'], url
    else:
        assert data == (ROOT/'src'/url.lstrip('/')).read_bytes(), url
    return name, data, {'source': url, 'path': name, 'bytes': len(data), 'sha256': digest}

with ThreadPoolExecutor(max_workers=4) as pool:
    files = list(pool.map(fetch, items))
with zipfile.ZipFile(output, 'w', compression=zipfile.ZIP_STORED) as archive:
    for name,data,_ in files:
        info=zipfile.ZipInfo(name,date_time=(2026,9,28,0,0,0))
        archive.writestr(info,data)
with zipfile.ZipFile(output) as archive:
    assert archive.testzip() is None
manifest = {'url':'/assets/erhu/downloads/erhu-promo-20260928.zip','bytes':output.stat().st_size,'sha256':hashlib.sha256(output.read_bytes()).hexdigest(),'files':[f[2] for f in files]}
(ROOT/'media/erhu-promo.json').write_text(json.dumps(manifest,ensure_ascii=False,indent=2)+'\n')
print(f'{len(videos)} videos, {len(photos)} photos, repertoire; {manifest["bytes"]} bytes')
