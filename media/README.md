# Video storage

Production MP4 files live on Sprinthost under:

`https://luxuryband.ru/assets/video/mp4/`

Git tracks only `manifest.json`; local working copies remain in
`src/assets/video/mp4/` and are ignored by Git.

## Verify production media

```bash
npm run media:check
```

## Upload a new or changed video once

The command uses normal SSH authentication and never stores credentials in the
repository:

```bash
SPRINTHOST_HOST=<host> \
SPRINTHOST_USER=<user> \
npm run media:upload -- src/assets/video/mp4/example-720.mp4
```

The uploader atomically replaces the production file, regenerates
`media/manifest.json`, and verifies every production video by size. Commit the
manifest together with the code that references the new filename.

Keep original camera masters in a separate Mac/external/cloud backup. The MP4
files in this directory are production encodes, not the only archival copy.

## Shared promo package

`lcband-promo-package.json` lists the original promo files and their readable
archive names, sizes, SHA-256 and CRC32 checksums. The website plays the same
video revisions, with smaller 720p/1080p encodes for playback. Original filenames
are retained in downloads; immutable public video paths contain a SHA-256 prefix.

`/promo-package.php` streams a UTF-8 ZIP64 from those files without storing a
second archive on the hosting account. It supports HEAD and single byte ranges
for download resumption. Publish all media before deploying a new catalogue.

Hosting access uses the existing SSH key directly:

```bash
ssh sprinthost-luxuryband
```

Vault is not required for this host. Keep other Vault access policies unchanged.

The PHP ZIP contract can be checked locally with `php tests/promo-zip.test.php`.
