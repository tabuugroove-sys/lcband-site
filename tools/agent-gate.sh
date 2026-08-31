#!/usr/bin/env bash
# =============================================================================
# agent-gate.sh — multi-agent coordination gate for lcband-site
#
# WHY THIS EXISTS:
#   Multiple autonomous agents (Claude Code, Codex) edit this repo. Git is the
#   SINGLE SOURCE OF TRUTH and every push auto-deploys the lightweight build
#   to the live domain luxuryband.ru via GitHub Actions (.github/workflows/
#   deploy-sprinthost.yml). If two agents edit in parallel — or one edits from a
#   stale local HEAD — they silently clobber each other's work on production.
#
#   Every agent MUST run `preflight` before editing and `release` after pushing.
#
# USAGE:
#   AGENT_NAME=claude  tools/agent-gate.sh preflight     # before ANY edit
#   AGENT_NAME=codex   tools/agent-gate.sh preflight
#   tools/agent-gate.sh check                            # scope check pre-commit
#   tools/agent-gate.sh live-posters                     # production poster srcs
#   tools/agent-gate.sh release                          # after commit + push
# =============================================================================
set -uo pipefail

REPO="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$REPO" || { echo "cannot cd to repo"; exit 1; }
LOCK="$REPO/.agent-lock"
LOCK_TTL=1800                       # stale lock after 30 min with a dead owner
LIVE_URL="https://luxuryband.ru/"

now()  { date +%s; }
iso()  { date "+%Y-%m-%d %H:%M:%S"; }
me()   { echo "${AGENT_NAME:-$(whoami)}"; }
die()  { echo "🔴 GATE ABORT: $*" >&2; exit 1; }
ok()   { echo "✅ GATE OK: $*"; }

field() { [ -f "$LOCK" ] && grep -m1 "^$1=" "$LOCK" 2>/dev/null | cut -d= -f2- || true; }

# returns 0 (true) when an existing lock can be ignored
lock_is_stale() {
  local pid ep
  pid="$(field pid)"; ep="$(field epoch)"
  [ -z "$pid" ] && return 0
  kill -0 "$pid" 2>/dev/null && return 1          # owner alive -> NOT stale
  [ -n "$ep" ] && [ $(( $(now) - ep )) -lt "$LOCK_TTL" ] && return 1
  return 0                                          # owner dead & old -> stale
}

case "${1:-help}" in
  preflight)
    git fetch origin --quiet || die "git fetch failed — network/auth?"
    [ -z "$(git status --porcelain)" ] || die "working tree NOT clean. Commit or stash first:
$(git status --short)"
    L="$(git rev-parse HEAD)"; R="$(git rev-parse origin/main)"
    [ "$L" = "$R" ] || die "local HEAD != origin/main — another agent pushed.
  Do: git pull --ff-only ; re-read live state ('live-posters') ; THEN edit.
  (local=${L:0:7} origin=${R:0:7})"
    if [ -f "$LOCK" ] && ! lock_is_stale; then
      die "repo LOCKED by '$(field agent)' (pid $(field pid), since $(field at)). Wait or coordinate."
    fi
    printf 'agent=%s\npid=%s\nepoch=%s\nat=%s\nhost=%s\n' \
      "$(me)" "$$" "$(now)" "$(iso)" "$(hostname -s)" > "$LOCK"
    ok "$(me) holds lock (pid $$). HEAD ${L:0:7} == origin/main. Edit now → commit → push → 'release'."
    ;;

  release)
    if [ ! -f "$LOCK" ]; then ok "no lock to release."; exit 0; fi
    hp="$(field pid)"; ha="$(field agent)"
    if [ "$hp" = "$$" ] || [ "$ha" = "$(me)" ] || [ "${2:-}" = "--force" ]; then
      rm -f "$LOCK"; ok "lock released by $(me)."
    else
      die "lock held by '$ha' (pid $hp), not you ($(me)/$$). Use 'release --force' only if certain."
    fi
    ;;

  check)
    echo "=== scope check: changes vs HEAD ==="
    git -c color.ui=never diff --stat HEAD
    echo "--- untracked ---"
    git status --porcelain | grep '^??' || echo "(none)"
    echo
    echo "RULE: a single-avatar swap = max 2 files (1 poster .jpg + home-body.njk)."
    echo "      Anything more is scope creep — STOP and re-read the task."
    ;;

  live-posters)
    echo "=== poster <img src> live on $LIVE_URL (production = truth) ==="
    curl -s "${LIVE_URL}?nocache=$(now)" \
      | grep -oE 'assets/video/posters/[a-z0-9-]+\.jpg(\?v=[a-z0-9]+)?' | sort -u \
      || echo "(could not read live HTML)"
    ;;

  *)
    sed -n '2,25p' "$0"
    ;;
esac
