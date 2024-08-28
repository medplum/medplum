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

pushd ../..

# Build the executable
./scripts/build-agent-sea-macos.sh

popd

# Sign the executable
codesign --sign - medplum-agent-$MEDPLUM_VERSION-macos

# Generate the installer checksum
sha256sum "medplum-agent-$MEDPLUM_VERSION-macos" > "medplum-agent-$MEDPLUM_VERSION-macos.sha256"

# Check the installer checksum
sha256sum --check "medplum-agent-$MEDPLUM_VERSION-macos.sha256"

# Check the build output within dist folder
ls -la

# Make sure binary runs
./medplum-agent-$MEDPLUM_VERSION-macos --help

# Move back to root
popd
