#!/usr/bin/env python3
"""Build versioned WebP variants for existing costume/live gallery photos."""
import hashlib
import json
import re
import subprocess
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
DEST = ROOT / "src/assets/photos/responsive"
DEST.mkdir(parents=True, exist_ok=True)
gallery = json.loads((ROOT / "src/_data/promoGallery.json").read_text())
sources = {f"/assets/costumes/{item['slug']}.jpg" for item in gallery["costumes"]}
sources.update(re.findall(r"/assets/photos/[\w-]+\.jpg", (ROOT / "src/live/index.njk").read_text()))
aliases = {
    "/assets/costumes/shimmer.jpg": "/assets/photos/concert-light.jpg",
    "/assets/costumes/dark-green-group.jpg": "/assets/photos/concert-light.jpg",
    "/assets/photos/promo-d36bfa38cad7.jpg": "/assets/photos/concert-light.jpg",
}
sources.update(aliases)
manifest = {}
built = {}
for url in sorted(sources):
    original = ROOT / 'src' / url.lstrip('/')
    source_hash = hashlib.sha256(original.read_bytes()).hexdigest()
    canonical = aliases.get(url, url)
    source = ROOT / "src" / canonical.lstrip("/")
    # Reuse a variant only for identical originals, including after a replacement.
    if hashlib.sha256(source.read_bytes()).hexdigest() != source_hash:
        canonical, source = url, original
    if canonical not in built:
        width, height = map(int, subprocess.check_output([
            "magick", "identify", "-format", "%w %h", str(source)
        ]).split())
        digest = hashlib.sha256(source.read_bytes()).hexdigest()[:12]
        stem = canonical.removeprefix("/assets/").removesuffix(".jpg").replace("/", "--")
        variants = []
        for target_width in sorted({min(width, n) for n in (480, 800, 1200, 1800, width)}):
            name = f"{stem}-{digest}-{target_width}.webp"
            target = DEST / name
            if not target.exists():
                subprocess.run([
                    "magick", str(source), "-auto-orient", "-colorspace", "sRGB",
                    "-resize", f"{target_width}x>", "-strip", "-quality", "82",
                    "-define", "webp:method=6", str(target)
                ], check=True)
            variants.append({"url": f"/assets/photos/responsive/{name}", "width": target_width, "bytes": target.stat().st_size})
        built[canonical] = {"width": width, "height": height, "variants": variants}
    manifest[url] = {"sourceSha256": source_hash, **built[canonical]}
(ROOT / "media/responsive-photos.json").write_text(json.dumps(manifest, indent=2) + "\n")
print(f"Built {sum(len(item['variants']) for item in built.values())} WebPs for {len(manifest)} image paths")
