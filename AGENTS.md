# Agent protocol — lcband-site

This repository is edited by **multiple autonomous agents** (Claude Code, Codex,
headless `claude -p`). This file is the **shared law**. Codex reads `AGENTS.md`,
Claude reads `CLAUDE.md` (which points here). Both MUST obey it verbatim.

The 2026-06-20 incident: an agent asked to "replace one avatar" instead committed
a series of posters + a global cache-bust, and a parallel agent rebuilt from a
stale state — wiping the other agent's already-live posters on production. Root
cause: **no sync gate, a `scp`-without-commit side channel, and scope creep.**

---

## 0. Deploy topology (know this before touching anything)

- **Git is the single source of truth.** The live site is whatever `origin/main`
  builds to — NOT whatever is on the server.
- Every `push` to `main` triggers **GitHub Actions** (`.github/workflows/
  deploy-sprinthost.yml`) which runs `PATHPREFIX=/ npx @11ty/eleventy` and deploys
  the built `_site/` to **BOTH** domains:
  - `a1279060.xsph.ru` (preview)
  - **`luxuryband.ru` (LIVE / production)**
- ⚠️ **Therefore: any push to `main` goes straight to production.** There is no
  "preview only" by default. Treat every commit as a production release.
- **NEVER deploy by `scp` without committing the same bytes to git first.** An
  uncommitted `scp` is reverted the moment any agent pushes (Actions rebuilds from
  git, which lacks your change). This was the #1 cause of the incident.
- A committed **`pre-push` git hook** (`tools/hooks/pre-push`, enable once:
  `git config core.hooksPath tools/hooks`) prints a **non-blocking reminder** when
  `origin/main` is ahead of you. It never blocks — the real safeguard is the rule
  below: always continue from the current state, never from memory.

---

## 1. Before ANY edit — run the gate (mandatory)

```bash
AGENT_NAME=claude tools/agent-gate.sh preflight     # or AGENT_NAME=codex
```

It enforces, and **aborts** if any fails:
1. `git fetch origin`
2. working tree is **clean**,
3. local `HEAD` **==** `origin/main` (you are continuing from the latest state),
4. no other agent holds the **lock** (`.agent-lock`).

On success it writes `.agent-lock` (your name + pid + time). If it aborts because
**HEAD != origin/main**, another agent worked after you: `git pull --ff-only`,
re-read the live state, and only then edit. **Never continue from a stale local
HEAD.**

## 2. Make the change — minimal scope

For "**replace one video avatar**" the entire diff is **exactly two files**:
- one optimized `src/assets/video/posters/<slug>.jpg`
- one line in `src/_includes/partials/home-body.njk` (only if the slug/poster
  mapping changes; usually the filename is reused and even this is unneeded).

**Do NOT**, unless the task explicitly says so:
- touch other posters or their array entries,
- add/replace videos (`assets/video/mp4/*`),
- add a global `?v=` cache-bust across all posters,
- refactor, reformat, or "improve" neighbouring markup.

Poster spec: **1800×1012**, sRGB, progressive mozjpeg `-quality ~78`, strip
metadata. Target ~150–270 KB.

## 3. The word "restore" means production state — not local HEAD

If the user says *"restore / bring back / it got wiped"*, do **not** assume it is
a browser-cache problem and do **not** patch over your local HEAD. Instead:

```bash
tools/agent-gate.sh live-posters     # what production actually serves now
git log --oneline -15 origin/main    # what changed and who
```

Reconstruct the **user's intended production state**, then re-apply it as a normal
committed change.

## 4. Commit + push (this IS the deploy)

```bash
tools/agent-gate.sh check            # scope check — expect ≤2 files
git add <only the files you changed> # never `git add -A` blindly
git commit -m "Update <slug> video poster"
git pull --ff-only && git push       # push = production deploy via Actions
```

Optional immediate refresh: after pushing, you MAY `scp` the *same committed*
poster to the server so it shows before Actions finishes — never different bytes.

## 5. After push — verify and release

```bash
curl -sI "https://luxuryband.ru/assets/video/posters/<slug>.jpg?v=<ver>" | grep -i content-length
tools/agent-gate.sh release
```

Verify **only the one poster** you changed returned HTTP 200 with the new size.

---

## Hard rules
- Continue from `origin/main` + live state, never from a stale local HEAD.
- Git first, `scp` never alone.
- One avatar = one jpg + (maybe) one line. Scope creep is a bug.
- Never delete or replace videos unless explicitly told.
- Always `release` the lock when done (or on abort).
