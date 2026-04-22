#!/usr/bin/env bash
# Apply GitHub repo + branch-protection settings from docs/superpowers/*.json.
# See docs/superpowers/specs/2026-04-22-apply-github-settings-script-design.md
# for rationale.
set -euo pipefail

cd "$(dirname "$0")/.."

DRY_RUN=0
SKIP_VERIFY=0

usage() {
  cat <<'EOF'
Usage: scripts/apply-github-settings.sh [--dry-run] [--skip-verify] [--help]

Applies docs/superpowers/repo-settings.json via PATCH /repos/:owner/:repo, then
docs/superpowers/branch-protection.json via PUT /repos/:owner/:repo/branches/:default/protection.
Reads branch protection back and diffs the normalized result against the source
JSON. Exits non-zero on drift.

Flags:
  --dry-run       Print the gh api commands that would run, do not mutate.
  --skip-verify   Apply settings but skip the readback + drift diff.
  --help          Show this message and exit.
EOF
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --dry-run) DRY_RUN=1; shift ;;
    --skip-verify) SKIP_VERIFY=1; shift ;;
    --help|-h) usage; exit 0 ;;
    --*) echo "unknown flag: $1" >&2; usage >&2; exit 2 ;;
    *)   echo "unexpected positional argument: $1" >&2; usage >&2; exit 2 ;;
  esac
done

# --- Preflight ----------------------------------------------------------------
command -v gh >/dev/null || { echo "gh is required; install https://cli.github.com/" >&2; exit 2; }
command -v jq >/dev/null || { echo "jq is required" >&2; exit 2; }
gh auth status >/dev/null 2>&1 || {
  echo "gh is not authenticated; run 'gh auth login'" >&2
  exit 3
}

# --- Resolve repo -------------------------------------------------------------
REPO_INFO=$(gh repo view --json nameWithOwner,defaultBranchRef \
  --jq '.nameWithOwner + " " + .defaultBranchRef.name' 2>/dev/null) || {
  echo "could not resolve current repo via 'gh repo view'; is this a GitHub repo clone?" >&2
  exit 4
}
OWNER_REPO=${REPO_INFO% *}
DEFAULT_BRANCH=${REPO_INFO##* }

REPO_SETTINGS=docs/superpowers/repo-settings.json
BRANCH_PROTECTION=docs/superpowers/branch-protection.json

echo "target: $OWNER_REPO (branch: $DEFAULT_BRANCH)"

# --- Apply or describe --------------------------------------------------------
if [[ "$DRY_RUN" == "1" ]]; then
  echo "→ would run: gh api --method PATCH /repos/$OWNER_REPO --input $REPO_SETTINGS"
  echo "→ would run: gh api --method PUT  /repos/$OWNER_REPO/branches/$DEFAULT_BRANCH/protection --input $BRANCH_PROTECTION"
  echo "✔ dry run complete, no changes made"
  exit 0
fi

echo "→ applying repo-level settings"
gh api --method PATCH "/repos/$OWNER_REPO" --input "$REPO_SETTINGS" >/dev/null

echo "→ applying branch protection"
gh api --method PUT "/repos/$OWNER_REPO/branches/$DEFAULT_BRANCH/protection" \
  --input "$BRANCH_PROTECTION" >/dev/null

if [[ "$SKIP_VERIFY" == "1" ]]; then
  echo "✔ applied (verify skipped)"
  exit 0
fi

# --- Verify: readback + drift diff --------------------------------------------
echo "→ verifying branch protection"
ACTUAL_RAW=$(mktemp)
ACTUAL_NORM=$(mktemp)
EXPECTED_NORM=$(mktemp)
trap 'rm -f "$ACTUAL_RAW" "$ACTUAL_NORM" "$EXPECTED_NORM"' EXIT

gh api "/repos/$OWNER_REPO/branches/$DEFAULT_BRANCH/protection" > "$ACTUAL_RAW"

FILTER=scripts/lib/normalize-branch-protection.jq
jq -S -f "$FILTER" "$ACTUAL_RAW"         > "$ACTUAL_NORM"
jq -S -f "$FILTER" "$BRANCH_PROTECTION"  > "$EXPECTED_NORM"

if diff -u "$EXPECTED_NORM" "$ACTUAL_NORM" >&2; then
  echo "✔ branch protection matches branch-protection.json"
  exit 0
else
  echo "✖ drift detected between branch-protection.json and GitHub" >&2
  exit 5
fi
