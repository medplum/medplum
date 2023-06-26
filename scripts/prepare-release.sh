#!/usr/bin/env bash

# Fail on error
set -e

# Echo commands
set -x

# Get the new version number
NEW_VERSION=$1

# If the new version is empty or not specified, exit
if [[ -z "${NEW_VERSION}" ]]; then
  echo "Usage: prepare-release.sh [NEW_VERSION]"
  exit 1
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

# Run `npm version $version --workspaces`
npm version "$NEW_VERSION" --workspaces

# Generate release notes
RELEASE_NOTES=$(git log $(git describe --tags --abbrev=0)..HEAD --pretty=format:'%s')

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
