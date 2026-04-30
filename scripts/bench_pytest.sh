#!/usr/bin/env bash
# Time the backend pytest suite the same way CI does and compare against
# .test-duration-budget. Useful for "did my change make tests slower?"
# without parsing CI logs.
set -euo pipefail

REPO=$(git rev-parse --show-toplevel)
BUDGET=$(cat "$REPO/.test-duration-budget")
TMP=$(mktemp)
trap 'rm -f "$TMP"' EXIT

uv run pytest -n auto --dist=worksteal --durations=30 \
  --cov=klassenzeit_backend --cov=klassenzeit_solver --cov-report=term \
  | tee "$TMP"

ACTUAL=$(grep -oE 'in [0-9]+\.?[0-9]*s' "$TMP" | tail -1 \
         | grep -oE '[0-9]+\.?[0-9]*' | awk '{print int($1)}')

printf "\nPytest wall-clock: %ss (budget: %ss)\n" "$ACTUAL" "$BUDGET"
if [ "$ACTUAL" -gt "$BUDGET" ]; then
  echo "Over budget by $((ACTUAL - BUDGET))s." >&2
  exit 1
fi
echo "Within budget."
