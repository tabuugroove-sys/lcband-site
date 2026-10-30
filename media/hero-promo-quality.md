# First-screen costume promos

The four `promo-costume-*` entries in `lcband-promo-package.json` open the approved
104.72-second edit, beginning in the costume shown in the selected photograph.
They are separate from the short, muted home-reel tiles below the first screen.

## 4K source of truth

Serve the approved H.264 3840×2160 masters without another lossy encode. Each has
2618 frames at 25 fps, AAC audio, BT.709 limited-range colour and a front-loaded
`moov` atom. The manifest SHA-256 identifies the exact approved bytes.

| Costume | Master SHA-256 prefix | Video bitrate |
| --- | --- | --- |
| Red | `4ef6085a27d4` | 24.32 Mbit/s |
| Black and white | `01dc7bdc6938` | 23.44 Mbit/s |
| Gold | `42ce52957175` | 22.58 Mbit/s |
| White | `9d71d4290f9c` | 23.48 Mbit/s |

The former HEVC VideoToolbox derivatives, limited to 4 Mbit/s and actually around
2.8 Mbit/s, added visible blocks on faces and hands. Their 2160p dimensions did
not preserve the detail of the masters. Do not restore them as the 4K option.

## Playback and storage

The hero has no video `src` before Play and uses `preload="none"`. Desktop starts
at 1080p; mobile/slow connections use 720p. The full master is requested only when
the viewer chooses 4K. Preserve this separation from initial page loading.

The red 4K file is byte-identical to the existing full promo and shares its
server inode. All four 1080p variants are derived directly from the 4K
masters using Lanczos scaling, libx264 CRF 22 / medium and copied AAC audio. Their
video bitrate is about 6 Mbit/s; large scene-dependent peaks are not clipped by
a low fixed-rate cap. Frame count, timing and AAC payloads are verified against
the masters. Unchanged 720p variants also use hard links under the new family
names. New files must be registered in `media/manifest.json` before upload,
published atomically, checked with server SHA-256, and only then referenced by
the public catalogue. The four retired HEVC 4K copies are retained locally for
rollback; their old playback and download URLs redirect to the approved masters.
This avoids occupying the hosting quota with both revisions. Never regenerate
the whole manifest from an incomplete local media directory.

Validate actual browser `currentSrc`, decoded dimensions and playback for all
four costumes. Compare face/hand crops at 100% scale: averaged SSIM alone missed
the visible defects in the old files. Retain the approved AAC packets unchanged.
