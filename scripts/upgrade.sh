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
# @types/express - version 5+ incompatible with express 4, waiting for express 5 upgrade
# eslint - version 9+ conflicts with Next.js plugins, holding back until fixed
# node-fetch - version 3+ requires ESM, holding back until server supports ESM
# react - version 18.3+ incompatible with react-native, waiting for fix
# rimraf - version 6+ requires Node 20+, holding back until Medplum v4
# supertest - version 7+ incompatible with superwstest, waiting for fix
# @tabler/icons-react - to avoid bad interaction with vite https://github.com/tabler/tabler-icons/issues/1233
# react-native - 0.76.x is broken with an error caused by flow parser breaking when using `expo-crypto`: `SyntaxError: {..}/react-native/Libraries/vendor/emitter/EventEmitter.js: Unexpected token, expected "]" (39:5)`
EXCLUDE="@types/express eslint node-fetch react react-dom rimraf supertest @tabler/icons-react react-native"

# First, only upgrade patch and minor versions
# --workspaces - Run on all workspaces
# --root - Runs updates on the root project in addition to specified workspaces
# --upgrade - Overwrite package file with upgraded versions
# --reject - Exclude packages matching the given string
# --target - Determines the version to upgrade to
# "minor" - Upgrade to the highest minor version without bumping the major version
npx npm-check-updates --workspaces --root --upgrade --reject "$EXCLUDE" --target minor

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

# Next, optimistically upgrade to the latest versions
# "latest" - Upgrade to whatever the package's "latest" git tag points to.
npx npm-check-updates --workspaces --root --upgrade --reject "$EXCLUDE" --target latest

# Check for changes in the working directory
if git diff --quiet; then
  echo "No active changes. Exiting the script."
  exit 0
fi

# Commit and push before running NPM install
git add -u .
git commit -m "Dependency upgrades - step 3"
git push origin "$BRANCH_NAME"

# Reinstall all dependencies
./scripts/reinstall.sh --update

# Commit and push after running NPM install
git add -u .
git commit -m "Dependency upgrades - step 4"
git push origin "$BRANCH_NAME"
