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
