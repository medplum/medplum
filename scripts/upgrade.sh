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
# eslint - version 9+ conflicts with Next.js plugins, holding back until fixed
# node-fetch - version 3+ requires ESM, holding back until server supports ESM
EXCLUDE="eslint node-fetch chromatic"

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

# Commit and push before running NPM install
git add -u .
git commit -m "Dependency upgrades - step 1"
git push origin "$BRANCH_NAME"
gh pr create --title "Dependency upgrades $DATE" --body "Dependency upgrades" --draft

# Reinstall all dependencies
./scripts/reinstall.sh --update

# Commit and push after running NPM install
git add -u .
git commit -m "Dependency upgrades - step 2"
git push origin "$BRANCH_NAME"
gh pr ready
