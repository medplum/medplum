#!/usr/bin/env bash

if [[ -z "${BOT_LAYER_NAME}" ]]; then
  echo "Using default BOT_LAYER_NAME 'medplum-bot-layer'"
  BOT_LAYER_NAME="medplum-bot-layer"
fi

# Fail on error
set -e

# Echo commands
set -x

# Delete previous temporary directory
rm -rf tmp

# Delete previous zip file
rm -rf medplum-bot-layer.zip

# Build tree: the monorepo lockfile with only the workspaces the layer needs,
# the same approach as the server Docker image (see build-docker-server.sh).
# @medplum/* are packed from this commit's build, so run after `npm run build`.
mkdir -p tmp/build/packages/bot-layer
cp package.json package-lock.json tmp/build/
cp packages/bot-layer/package.json tmp/build/packages/bot-layer/
for pkg in ccda core definitions; do
  mkdir -p "tmp/build/packages/${pkg}"
  TARBALL=$(npm pack -w "packages/${pkg}" --ignore-scripts --pack-destination tmp --json | jq -r '.[0].filename')
  tar -xzf "tmp/${TARBALL}" -C "tmp/build/packages/${pkg}" --strip-components=1
done

# Install dependencies
# npm ci fails instead of re-resolving if package-lock.json is out of sync.
# --ignore-scripts: this layer is built with AWS credentials in CI, and nothing in
# the dependency tree needs a lifecycle script (ssh2's only runs when its optional
# cpu-features/nan deps are present, which --omit=optional already excludes).
(cd tmp/build && npm ci --omit=dev --omit=optional --ignore-scripts)

# Lambda only resolves layer packages from /opt/nodejs/node_modules
if [[ -d tmp/build/packages/bot-layer/node_modules ]]; then
  echo "Error: bot layer has dependencies that npm could not hoist:" >&2
  ls tmp/build/packages/bot-layer/node_modules >&2
  exit 1
fi

# Assemble the layer, replacing the @medplum/* workspace symlinks with real files
mkdir -p tmp/layer/nodejs
cp -RL tmp/build/node_modules tmp/layer/nodejs/
rm -rf tmp/layer/nodejs/node_modules/.bin tmp/layer/nodejs/node_modules/@medplum/bot-layer
cp -r packages/bot-layer/fonts tmp/layer/

SYMLINKS=$(find tmp/layer -type l)
if [[ -n "${SYMLINKS}" ]]; then
  echo "Error: bot layer contains symlinks:" >&2
  echo "${SYMLINKS}" >&2
  exit 1
fi

# Create the zip file
(cd tmp/layer && zip -r -q ../medplum-bot-layer.zip .)

# Publish the bot layer
aws lambda publish-layer-version \
  --layer-name "$BOT_LAYER_NAME" \
  --description "Medplum Bot Layer" \
  --license-info "Apache-2.0" \
  --compatible-runtimes "nodejs22.x" \
  --zip-file fileb://tmp/medplum-bot-layer.zip
