#!/usr/bin/env bash

# Agent Installer - Step 2: Build installer after signing
# This script creates the final installer using makensis

# Fail on error
set -e

# Pre-requisites
if ! command -v makensis >/dev/null 2>&1; then
    echo "makensis required"
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

# Build the installer
# If SKIP_SIGNING is not empty, then define SKIP_SIGNING symbol
if [ -n "$SKIP_SIGNING" ]; then
  makensis -DSKIP_SIGNING installer.nsi # globally defines the SKIP_SIGNING symbol
else
  makensis installer.nsi
fi

# Generate the installer checksum
sha256sum "medplum-agent-installer-$MEDPLUM_FULL_VERSION.exe" > "medplum-agent-installer-$MEDPLUM_FULL_VERSION.exe.sha256"

# Check the installer checksum
sha256sum --check "medplum-agent-installer-$MEDPLUM_FULL_VERSION.exe.sha256"

if [ -z "$SKIP_SIGNING" ]; then
  # Generate a GPG signature for the installer
  # --batch = Use batch mode. Never ask, do not allow interactive commands.
  # --yes = Assume "yes" on most questions. Should not be used in an option file.
  # --pinentry-mode loopback = Allows the passphrase to be set via command line or fd.
  # --passphrase-fd 0 = Read the passphrase from file descriptor 0 (stdin).
  # --local-user = Specify the key to use for signing.
  # --detach-sign --armor = Create a detached ASCII armored signature.
  echo "$GPG_PASSPHRASE" | gpg \
    --batch \
    --yes \
    --pinentry-mode loopback \
    --passphrase-fd 0 \
    --local-user "$GPG_KEY_ID" \
    --detach-sign --armor \
    "medplum-agent-installer-$MEDPLUM_FULL_VERSION.exe"

  # Check the signature
  gpg --verify "medplum-agent-installer-$MEDPLUM_FULL_VERSION.exe.asc"
fi

# Check the build output
ls -la

# Move back to root
popd
