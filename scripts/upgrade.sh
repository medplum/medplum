#!/usr/bin/env bash

# Fail on error
set -e

# Echo commands
set -x

# Use the Github gh tool to make sure the user is logged in
gh auth status

# Function to check if current branch is a dependency upgrade branch
is_dep_upgrade_branch() {
    local current_branch=$(git rev-parse --abbrev-ref HEAD)
    [[ "$current_branch" =~ ^dep-upgrades-[0-9]{4}-[0-9]{2}-[0-9]{2}$ ]]
}

# Set branch name based on current branch or create new one
DATE=$(date +%Y-%m-%d)
if is_dep_upgrade_branch; then
    BRANCH_NAME=$(git rev-parse --abbrev-ref HEAD)
    echo "Already on dependency upgrade branch: $BRANCH_NAME"
else
    BRANCH_NAME="dep-upgrades-$DATE"
fi

# Function to get the last successful step
get_last_step() {
    local branch=$1
    # Get the commit where this branch diverged from main
    local base_commit=$(git merge-base origin/main "$branch")
    # Try to get the latest commit message matching the pattern, only looking at commits after the base
    local last_commit=$(git log --grep="Dependency upgrades - step [0-9]" --format="%s" "$base_commit..$branch" 2>/dev/null | head -n 1)
    if [[ $last_commit =~ step\ ([0-9]) ]]; then
        echo "${BASH_REMATCH[1]}"
    else
        echo "0"
    fi
}

# Handle branch checkout/creation
if ! is_dep_upgrade_branch; then
    if git ls-remote --exit-code --heads origin "$BRANCH_NAME" >/dev/null 2>&1; then
        echo "Branch $BRANCH_NAME exists remotely"
        git fetch origin
        git checkout "$BRANCH_NAME"
    else
        echo "Creating new branch $BRANCH_NAME"
        git checkout -b "$BRANCH_NAME"
    fi
fi

# Get the last completed step
LAST_STEP=$(get_last_step "$BRANCH_NAME")

echo "Last completed step: $LAST_STEP"

# Exclude known problem packages
# @types/express - version 5+ incompatible with express 4, waiting for express 5 upgrade
# @types/react - version 19+ incompatible with react 18, waiting for fix
# eslint - version 9+ conflicts with Next.js plugins, holding back until fixed
# node-fetch - version 3+ requires ESM, holding back until server supports ESM
# react - version 18.3+ incompatible with react-native, waiting for fix
# react-router-dom - version 7+ has breaking changes, will fix separately
# rimraf - version 6+ requires Node 20+, holding back until Medplum v4
# supertest - version 7+ incompatible with superwstest, waiting for fix
# @tabler/icons-react - to avoid bad interaction with vite https://github.com/tabler/tabler-icons/issues/1233
# react-native - 0.76.x is broken with an error caused by flow parser breaking when using `expo-crypto`: `SyntaxError: {..}/react-native/Libraries/vendor/emitter/EventEmitter.js: Unexpected token, expected "]" (39:5)`
# storybook-addon-mantine - 4.1.0 seems to accidentally backported requirement for React 19 from v5: https://github.com/josiahayres/storybook-addon-mantine/issues/18
EXCLUDE="@types/express @types/react @types/react-dom eslint node-fetch react react-dom react-router-dom rimraf supertest @tabler/icons-react react-native storybook-addon-mantine"

if [ "$LAST_STEP" -lt 1 ]; then
    # First, only upgrade patch and minor versions
    # --workspaces - Run on all workspaces
    # --root - Runs updates on the root project in addition to specified workspaces
    # --upgrade - Overwrite package file with upgraded versions
    # --reject - Exclude packages matching the given string
    # --target - Determines the version to upgrade to
    # "minor" - Upgrade to the highest minor version without bumping the major version
    # `enginesNode` makes sure that packages can be run against the node requirement specified in the monorepo "engines.node"
    npx npm-check-updates --workspaces --root --upgrade --reject "$EXCLUDE" --target minor --enginesNode

    # Commit and push before running NPM install
    git add -u .
    git commit -m "Dependency upgrades - step 1"
    git push origin "$BRANCH_NAME"
    
    if [ "$LAST_STEP" -eq 0 ]; then
        gh pr create --title "Dependency upgrades $DATE" --body "Dependency upgrades" --draft
    fi
fi

if [ "$LAST_STEP" -lt 2 ]; then
    # Reinstall all dependencies
    ./scripts/reinstall.sh --update

    # Commit and push after running NPM install
    git add -u .
    git commit -m "Dependency upgrades - step 2"
    git push origin "$BRANCH_NAME"
    gh pr ready
fi

if [ "$LAST_STEP" -lt 3 ]; then
    # Next, optimistically upgrade to the latest versions
    # "latest" - Upgrade to whatever the package's "latest" git tag points to.
    # `enginesNode` makes sure that packages can be run against the node requirement specified in the monorepo "engines.node"
    npx npm-check-updates --workspaces --root --upgrade --reject "$EXCLUDE" --target latest --enginesNode

    # Check for changes in the working directory
    if git diff --quiet; then
        echo "No active changes. Exiting the script."
        exit 0
    fi

    # Commit and push before running NPM install
    git add -u .
    git commit -m "Dependency upgrades - step 3"
    git push origin "$BRANCH_NAME"
fi

if [ "$LAST_STEP" -lt 4 ]; then
    # Reinstall all dependencies
    ./scripts/reinstall.sh --update

    # Commit and push after running NPM install
    git add -u .
    git commit -m "Dependency upgrades - step 4"
    git push origin "$BRANCH_NAME"
fi
