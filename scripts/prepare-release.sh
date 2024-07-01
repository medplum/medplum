#!/usr/bin/env bash

# Fail on error
set -e

# Echo commands
set -x

# Get the current version number
CURR_VERSION=$(node -p "require('./package.json').version")

# Convert version string to array using '.' as delimiter
IFS='.' read -ra CURR_VERSION_PARTS <<< "$CURR_VERSION"

# Check if there have been any data migrations since the last release
DATA_MIGRATIONS=$(git diff v$CURR_VERSION --name-only -- packages/server/src/migrations/data)
if [ -z "$DATA_MIGRATIONS" ]; then
    echo "No data migrations since v$CURR_VERSION, increasing patch version"
    ((CURR_VERSION_PARTS[2]++)) || true
else
    echo "New data migrations since v$CURR_VERSION, increasing minor version"
    ((CURR_VERSION_PARTS[1]++)) || true
    CURR_VERSION_PARTS[2]=0
fi

# Build the new version number
NEW_VERSION="${CURR_VERSION_PARTS[0]}.${CURR_VERSION_PARTS[1]}.${CURR_VERSION_PARTS[2]}"

# Check if a new version is provided as a command line argument and override if present
if [ ! -z "$1" ]; then
    NEW_VERSION=$1
    echo "Overriding new version to: $NEW_VERSION"
else
    echo "New version: $NEW_VERSION"
fi

# Use the Github gh tool to make sure the user is logged in
gh auth status

# Start a new branch
BRANCH_NAME="version-$NEW_VERSION"
git checkout -b "$BRANCH_NAME"

# Set version in sonar-project.properties
sed -i'' -E -e "s/sonar.projectVersion=.*/sonar.projectVersion=$NEW_VERSION/g" sonar-project.properties

# Set version in package.json
sed -i'' -E -e "s/\"version\": \"[^\"]+\"/\"version\": \"$NEW_VERSION\"/g" package.json

# Set version in all examples/\*/package.json files
find examples -name 'package.json' -print0 | xargs -0 sed -i'' -E -e "s/(\"@medplum\/[^\"]+\"): \"[^\"]+\"/\1: \"$NEW_VERSION\"/g"
find packages -name 'package.json' -print0 | xargs -0 sed -i'' -E -e "s/(\"@medplum\/[^\"]+\"): \"[^\"]+\"/\1: \"$NEW_VERSION\"/g"

# Run `npm version $version --workspaces`
npm version "$NEW_VERSION" --workspaces

# Generate release notes
RELEASE_NOTES=$(echo -e "## What's Changed\n" && git log $(git describe --tags --abbrev=0)..HEAD --pretty=format:'* %s' --reverse && echo -e "\n\n**Full Changelog**: https://github.com/medplum/medplum/compare/v$CURR_VERSION...v$NEW_VERSION")

# Add changes to the staging area
git add -u .

# Commit the changes with the release notes
git commit -m "Release Version $NEW_VERSION" -m "$RELEASE_NOTES"

# Push the changes to the remote branch
git push origin "$BRANCH_NAME"

# Create pull request
gh pr create --title "Release Version $NEW_VERSION" --body "$RELEASE_NOTES"

# Create draft release
gh release create "v$NEW_VERSION" --notes "$RELEASE_NOTES" --title "Version $NEW_VERSION" --draft
