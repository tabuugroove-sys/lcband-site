# CLAUDE.md — lcband-site

**Read [`AGENTS.md`](AGENTS.md) first. It is the shared law for every agent
(Claude + Codex) and overrides habit.** This file only adds Claude-specific notes.

## Before editing — always
```bash
AGENT_NAME=claude tools/agent-gate.sh preflight
```
…and `tools/agent-gate.sh release` after you push. No exceptions.

## ⚠️ My old `scp` protocol is DEPRECATED
Earlier memory said "deploy = build + `scp` to Sprinthost." That is now **wrong and
dangerous**: a push by any agent triggers GitHub Actions, which rebuilds from git
and **reverts any `scp` that was not also committed**. This wiped a whole session
of poster work on 2026-06-20.

**New rule: git is the source of truth.** Edit → commit → `git push` (Actions
deploys to preview *and* `luxuryband.ru`). `scp` is allowed only as an *immediate
refresh of the exact bytes you just committed*, never as the deploy itself, never
uncommitted.

## Production is not gated by default
Every commit to `main` reaches `luxuryband.ru`. There is no "preview only" path
right now. If the user wants preview-first, that requires changing
`deploy-sprinthost.yml` (boevoy behind `workflow_dispatch`) — propose it, don't
assume it.

## Concurrency
Other agents (Codex ops in `~/lcband`, headless `claude -p`) run on this machine.
The gate's `.agent-lock` + `HEAD == origin/main` check is what keeps us from
clobbering each other. Trust the gate; if it aborts, reconcile — don't `--force`
past it.

## Key paths
- `src/_includes/partials/home-body.njk` — home carousels (promos + lives arrays)
- `src/assets/video/posters/<slug>.jpg` — video avatars (1800×1012)
- `.github/workflows/deploy-sprinthost.yml` — the deploy (push-triggered)
