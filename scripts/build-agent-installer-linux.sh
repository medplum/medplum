#!/usr/bin/env bash

# Agent linux build script

# Fail on error
set -e

# Get the current version number
export MEDPLUM_VERSION=$(node -p "require('./package.json').version")

# Move into packages/agent
pushd packages/agent

# Build the agent
npm run build

# Build the executable
npx pkg ./dist/cjs/index.cjs --targets node18-linux --output "medplum-agent-$MEDPLUM_VERSION-linux" --options no-warnings

# Generate the installer checksum
sha256sum "medplum-agent-$MEDPLUM_VERSION-linux" > "medplum-agent-$MEDPLUM_VERSION-linux.sha256"

# Check the installer checksum
sha256sum --check "medplum-agent-$MEDPLUM_VERSION-linux.sha256"

# Check the build output within dist folder
ls -la

# Move back to root
popd
