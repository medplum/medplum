#!/usr/bin/env bash

# Fail on error
set -e

# Get the current version number
export MEDPLUM_VERSION=$(node -p "require('./package.json').version")

# Move into packages/agent
pushd packages/agent

# Build the agent
npm run build

# # Check Node version
# # If not the expected default version, then warn
# nodeversion=$(node -v)
# if [$(echo nodeversion | cut -d '.' -f 1) != "v20"]; then
#   echo "Expected to be on v20.x.x but on $(node -v)"
# fi

# Generate blob to inject into node executable
node --experimental-sea-config sea-config.json

# Copy the local node binary
node -e "require('fs').copyFileSync(process.execPath, 'dist/medplum-agent-$MEDPLUM_VERSION-win64.exe')" 

# Remove signature from binary

echo "Removing signature from Node binary..."
# If no defined signtool path, try to find it in PATH
if [[ -z "$SIGNTOOL_PATH" ]]; then
  echo "Using signtool from PATH"
  signtool remove -s dist/medplum-agent-$MEDPLUM_VERSION-win64.exe
else
  echo "Using signtool located at $SIGNTOOL_PATH"
  # Otherwise use the defined path from the env var
  "$SIGNTOOL_PATH" remove -s dist/medplum-agent-$MEDPLUM_VERSION-win64.exe
fi
echo "Signature successfully removed."

# NOTE: If the above step fails, you likely need to install Windows 10 SDK
#
# References:
# https://developer.microsoft.com/en-us/windows/downloads/windows-sdk/
# https://stackoverflow.com/a/52963704

# Inject blob into binary
npx postject dist/medplum-agent-$MEDPLUM_VERSION-win64.exe NODE_SEA_BLOB sea-prep.blob --sentinel-fuse NODE_SEA_FUSE_fce680ab2cc467b6e072b8b5df1996b2 

popd
