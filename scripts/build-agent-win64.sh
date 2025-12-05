#!/usr/bin/env bash

# Agent Installer - Step 1: Build executable and download dependencies
# This script prepares the files that need to be signed
# Signing is now handled by Azure Trusted Signing Action in the GitHub workflow

# Fail on error
set -e

# Pre-requisites
if ! command -v wget >/dev/null 2>&1; then
    echo "wget required"
    exit 1
fi

# Make sure environment variables are set
if [ -z "$SHAWL_VERSION" ]; then
    echo "SHAWL_VERSION is not set"
    exit 1
fi

# Get the current version number
export MEDPLUM_VERSION=$(node -p "require('./package.json').version")
# Get full version, including the git shorthash, delimited by a '-'
export MEDPLUM_FULL_VERSION="$MEDPLUM_VERSION-$MEDPLUM_GIT_SHORTHASH"

# Move into packages/agent
pushd packages/agent

pushd ../..

# Build the executable
./scripts/build-agent-sea-win64.sh

popd

# Download Shawl exe
rm -f shawl-$SHAWL_VERSION-win64.zip
wget https://github.com/mtkennerly/shawl/releases/download/$SHAWL_VERSION/shawl-$SHAWL_VERSION-win64.zip
unzip shawl-$SHAWL_VERSION-win64.zip
mv shawl.exe dist/shawl-$SHAWL_VERSION-$MEDPLUM_GIT_SHORTHASH-win64.exe

# Download Shawl legal
rm -f shawl-$SHAWL_VERSION-legal.zip
wget https://github.com/mtkennerly/shawl/releases/download/$SHAWL_VERSION/shawl-$SHAWL_VERSION-legal.zip
unzip shawl-$SHAWL_VERSION-legal.zip
mv shawl-$SHAWL_VERSION-legal.txt dist

# Check the build output
ls -la dist

# Make sure binary runs
dist/medplum-agent-$MEDPLUM_FULL_VERSION-win64.exe --help

# Move back to root
popd
