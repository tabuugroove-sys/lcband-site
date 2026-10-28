"""Exercise the real download endpoint with tiny local media, never production ZIPs."""
import io
import json
import pathlib
import shutil
import socket
import subprocess
import tempfile
import time
import urllib.error
import urllib.request
import zipfile
import zlib


ROOT = pathlib.Path(__file__).resolve().parents[1]


def request(origin, query="", method="GET", headers=None):
    req = urllib.request.Request(origin + "/promo-package.php" + query, method=method, headers=headers or {})
    try:
        response = urllib.request.urlopen(req, timeout=5)
    except urllib.error.HTTPError as error:
        response = error
    with response:
        return response.status, response.headers, response.read()


with tempfile.TemporaryDirectory(prefix="lcb-promo-http-") as directory:
    public = pathlib.Path(directory)
    (public / "lib").mkdir()
    (public / "assets/video/mp4").mkdir(parents=True)
    shutil.copy2(ROOT / "src/promo-package.php", public)
    shutil.copy2(ROOT / "src/lib/promo-zip.php", public / "lib")
    entries = []
    payloads = [b"original 4K fixture", b"full HD", b"HD"]
    for index, payload in enumerate(payloads):
        relative = f"assets/video/mp4/test-{index}.mp4"
        (public / relative).write_bytes(payload)
        entries.append({"name": "video.mp4", "path": relative, "bytes": len(payload), "crc32": f"{zlib.crc32(payload):08x}"})
    catalogue = {
        "archiveName": "LCBAND-promo-4K-original.zip", "timestamp": 1791979200, "files": [entries[0]],
        "variants": {
            "1080": {"archiveName": "LCBAND-promo-1080p.zip", "files": [entries[1]]},
            "720": {"archiveName": "LCBAND-promo-720p.zip", "files": [entries[2]]},
        },
    }
    catalogue_file = public / "promo-package.json"
    catalogue_file.write_text(json.dumps(catalogue))
    with socket.socket() as listener:
        listener.bind(("127.0.0.1", 0))
        port = listener.getsockname()[1]
    process = subprocess.Popen(["php", "-S", f"127.0.0.1:{port}", "-t", directory], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    origin = f"http://127.0.0.1:{port}"
    try:
        for attempt in range(50):
            try:
                request(origin, method="HEAD")
                break
            except urllib.error.URLError:
                time.sleep(0.05)
        etags = []
        for index, query in enumerate(["", "?quality=1080", "?quality=720"]):
            status, headers, body = request(origin, query)
            assert status == 200
            assert int(headers["Content-Length"]) == len(body)
            with zipfile.ZipFile(io.BytesIO(body)) as archive:
                assert archive.testzip() is None
                assert archive.read("video.mp4") == payloads[index]
            etags.append(headers["ETag"])
            status, head_headers, head_body = request(origin, query, method="HEAD")
            assert status == 200 and not head_body
            assert head_headers["Content-Length"] == headers["Content-Length"]
            for value, expected in [("bytes=0-3", body[:4]), ("bytes=-22", body[-22:])]:
                status, partial_headers, partial = request(origin, query, headers={"Range": value})
                assert status == 206 and partial == expected
                assert partial_headers["Content-Range"].endswith("/" + str(len(body)))
            assert request(origin, query, headers={"If-None-Match": headers["ETag"]})[0] == 304
            assert request(origin, query, headers={"Range": "bytes=999999-"})[0] == 416
        assert len(set(etags)) == 3
        assert request(origin, "?quality=720", headers={"Range": "bytes=0-3", "If-Range": etags[0]})[0] == 200
        for query in ["?quality=2160", "?quality=4k", "?quality=", "?quality[]=720", "?quality=../720"]:
            assert request(origin, query)[0] == 400, query
        assert request(origin, "?quality=bad&lang=en")[2] == b"Unknown archive quality."
        assert request(origin, method="POST")[0] == 405
        del catalogue["variants"]["720"]
        catalogue_file.write_text(json.dumps(catalogue))
        assert request(origin, "?quality=720")[0] == 503
        assert request(origin)[0] == 200
        print(json.dumps({"ok": True, "variants": 3, "verified": ["ZIP CRC and payload", "Content-Length", "HEAD", "Range", "ETag isolation", "invalid quality 400", "missing quality 503", "no silent fallback"]}))
    finally:
        process.terminate()
        process.wait(timeout=5)
