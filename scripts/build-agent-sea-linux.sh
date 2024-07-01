#!/usr/bin/env bash

# Fail on error
set -e

# Get the current version number
export MEDPLUM_VERSION=$(node -p "require('./package.json').version")

# Move into packages/agent
pushd packages/agent

# Build the agent
npm run build

# Check Node version
# If not the expected default version, then warn
node_version=$(node -v)
major_version=$(echo "$node_version" | cut -d '.' -f 1)
if [ "$major_version" != "v20" ]; then
  echo "WARNING: Expected to be on v20.x.x but on $node_version"
fi

# Generate blob to inject into node executable
node --experimental-sea-config sea-config.json

# Copy the local node binary
cp $(command -v node) medplum-agent-$MEDPLUM_VERSION-linux

# Inject blob into binary
npx postject medplum-agent-$MEDPLUM_VERSION-linux NODE_SEA_BLOB sea-prep.blob \
    --sentinel-fuse NODE_SEA_FUSE_fce680ab2cc467b6e072b8b5df1996b2

popd
