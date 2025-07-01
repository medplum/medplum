#!/usr/bin/env bash

# Fail on error
set -e

# Echo commands
set -x

# Initialize additional exclusions variable
ADDITIONAL_EXCLUDES=""

# Parse command line arguments
while [[ $# -gt 0 ]]; do
    case "$1" in
        --exclude=*)
            ADDITIONAL_EXCLUDES="${1#*=}"
            shift
            ;;
        *)
            echo "Error: Unknown argument '$1'"
            echo "Usage: $0 [--exclude=\"package1 package2 package3\"]"
            exit 1
            ;;
    esac
done

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
# @tabler/icons-react - to avoid bad interaction with vite https://github.com/tabler/tabler-icons/issues/1233
EXCLUDE="@tabler/icons-react"

# Append any additional excludes from the command line
if [ -n "$ADDITIONAL_EXCLUDES" ]; then
    echo "Adding additional excludes: $ADDITIONAL_EXCLUDES"
    EXCLUDE="$EXCLUDE $ADDITIONAL_EXCLUDES"
fi

# @mantine/* - Holding back Mantine 8 until Medplum 5
# @storybook/* - Holding back Storybook 9 until Medplum 5
# storybook-mantine-addon - Holding back until Mantine 8 is released
# @types/express - version 5+ incompatible with express 4, waiting for express 5 upgrade
# @types/node - We specifically don't want to increment major version for Node types since we need to make sure we satisfy backwards compat with the minimum version of Node that we support
# commander - v13 has backwards-incompatible changes which require a decent amount of refactoring to get our current code to work. We are considering migrating off of commander but for now we should just freeze it
# eslint - version 9+ conflicts with Next.js plugins, holding back until fixed
# jest - version 30+ conflicts with jest-expo, holding back until fixed
# jose - version 6+ requires ESM (depending on the precise NodeJS version), holding back until server supports ESM
# node-fetch - version 3+ requires ESM, holding back until server supports ESM
# express - version 5 is now latest and has some breaking changes -- we need to make sure middleware and other related deps work with new version
MAJOR_EXCLUDE="@jest/* @mantine/* @storybook/* @types/express @types/jest @types/node babel-jest commander eslint express jest jest-* jose node-fetch npm storybook storybook-*"

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
fi

# Temporarily unset -e flag so that script won't exit early on next error
set +e

# Check if there is a PR for this branch already
# Skip creation if there is, otherwise create the PR for this branch
gh pr view
PR_VIEW_EXIT_CODE=$?

# Set the -e flag back 
set -e

if [ "$PR_VIEW_EXIT_CODE" -ne 0 ]; then
    echo "No existing PR found, creating PR..."
    gh pr create --title "Dependency upgrades $DATE" --body "Dependency upgrades" --draft
else
    echo "Existing PR found, skipping create"
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
    npx npm-check-updates --workspaces --root --upgrade --reject "$EXCLUDE $MAJOR_EXCLUDE" --target latest --enginesNode

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
