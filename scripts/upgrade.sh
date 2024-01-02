#!/usr/bin/env bash

# Fail on error
set -e

# Echo commands
set -x

# Use the Github gh tool to make sure the user is logged in
gh auth status

# Start a new branch
DATE=$(date +%Y-%m-%d)
BRANCH_NAME="dep-upgrades-$DATE"
git checkout -b "$BRANCH_NAME"

# Exclude known problem packages
# @mantine/* - holding back until the Mantine 7 migration is complete
# hibp - version 14+ requires ESM, holding back until server supports ESM
# node-fetch - version 3+ requires ESM, holding back until server supports ESM
EXCLUDE="@mantine/* hibp node-fetch"

npx npm-check-updates -u -x "$EXCLUDE" --packageFile package.json

for dir in `ls packages`; do
  if test -f "packages/$dir/package.json"; then
    npx npm-check-updates -u -x "$EXCLUDE" --packageFile "packages/$dir/package.json"
  fi
done

for dir in `ls examples`; do
  if test -f "examples/$dir/package.json"; then
    npx npm-check-updates -u -x "$EXCLUDE" --packageFile "examples/$dir/package.json"
  fi
done

# Reinstall all dependencies
./scripts/reinstall.sh

# Add changes to the staging area
git add -u .

# Commit the changes with the release notes
git commit -m "Dependency upgrades"

# Push the changes to the remote branch
git push origin "$BRANCH_NAME"

# Create pull request
gh pr create --title "Dependency upgrades"
