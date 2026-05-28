#!/bin/bash
# Sync changes from upstream Medplum into a review branch.
# Run monthly or before pulling in a new Medplum release.
#
# Usage: bash infrastructure/scripts/sync-upstream.sh
set -e

UPSTREAM_REMOTE="upstream"
BASE_BRANCH="main"
SYNC_BRANCH="upstream-sync/$(date +%Y-%m-%d)"

echo "Fetching $UPSTREAM_REMOTE..."
git fetch "$UPSTREAM_REMOTE"

echo "Creating sync branch: $SYNC_BRANCH"
git checkout -b "$SYNC_BRANCH" "origin/$BASE_BRANCH"

echo "Merging $UPSTREAM_REMOTE/main..."
if git merge "$UPSTREAM_REMOTE/main" --no-edit; then
  echo ""
  echo "Clean merge. Pushing $SYNC_BRANCH..."
  git push -u origin "$SYNC_BRANCH"
  echo ""
  echo "Next: open a PR from '$SYNC_BRANCH' → '$BASE_BRANCH' and review the diff."
else
  echo ""
  echo "Merge conflicts detected. Resolve them, then:"
  echo "  git add ."
  echo "  git commit"
  echo "  git push -u origin $SYNC_BRANCH"
  echo ""
  git status
  exit 1
fi
