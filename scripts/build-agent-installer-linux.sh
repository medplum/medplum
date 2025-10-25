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
./scripts/build-agent-sea-linux.sh

popd

# Generate the installer checksum
sha256sum "medplum-agent-$MEDPLUM_VERSION-linux" > "medplum-agent-$MEDPLUM_VERSION-linux.sha256"

# Check the installer checksum
sha256sum --check "medplum-agent-$MEDPLUM_VERSION-linux.sha256"

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
    "medplum-agent-$MEDPLUM_VERSION-linux"

  # Check the signature
  gpg --verify "medplum-agent-$MEDPLUM_VERSION-linux.asc"
fi

# Check the build output within dist folder
ls -la

# Make sure binary runs
./medplum-agent-$MEDPLUM_VERSION-linux --help

# Move back to root
popd
