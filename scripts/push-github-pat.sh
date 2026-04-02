#!/usr/bin/env bash
# Push to GitHub using a PAT without changing global git config or credential helpers.
# 1. Create an empty repo on GitHub (no README/license) or use an existing one.
# 2. Create a PAT: GitHub → Settings → Developer settings → Fine-grained or classic token (repo scope).
# 3. Run from repo root (do NOT paste the token into the command line — use env):
#
#    export GITHUB_TOKEN='ghp_xxxxxxxx'
#    export GITHUB_REPO='your-username/twilio-status'
#    ./scripts/push-github-pat.sh
#
# Optional: GITHUB_USER=git (default) — GitHub accepts PAT as password with user "git".

set -euo pipefail
cd "$(dirname "$0")/.."

REPO="${GITHUB_REPO:?Set GITHUB_REPO, e.g. octocat/twilio-status}"
TOKEN="${GITHUB_TOKEN:?Set GITHUB_TOKEN to your GitHub PAT}"
USER="${GITHUB_USER:-git}"

if ! git rev-parse --git-dir >/dev/null 2>&1; then
  echo "Not a git repository." >&2
  exit 1
fi

ENC_TOKEN="$(GITHUB_TOKEN="$TOKEN" python3 -c "
import os, urllib.parse
print(urllib.parse.quote(os.environ['GITHUB_TOKEN'], safe=''))
")"

REMOTE="https://${USER}:${ENC_TOKEN}@github.com/${REPO}.git"

BRANCH="$(git branch --show-current 2>/dev/null || echo main)"
echo "Pushing branch '${BRANCH}' to github.com/${REPO} ..."
# Disable credential helpers so this URL's token is used (not macOS Keychain / another account).
GIT_TERMINAL_PROMPT=0 git -c credential.helper= push -u "$REMOTE" "$BRANCH"

echo "Done. Remote URL with token was not saved (one-off push)."
