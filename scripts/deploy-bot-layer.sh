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

# Create a temporary directory for the layer
mkdir -p tmp/nodejs/

# Copy package.json into the temporary directory
cp packages/bot-layer/package.json tmp/nodejs/

# Copy the fonts
cp -r packages/bot-layer/fonts tmp/

# Move into the temporary directory
cd tmp/nodejs/

# Install dependencies
npm install --omit=dev --omit=optional

# Go up one directory to the temp directory
# The zip file must be in the parent directory.
cd ..

# Create the zip file
zip -r -q medplum-bot-layer.zip .

# Publish the bot layer
aws lambda publish-layer-version \
  --layer-name "$BOT_LAYER_NAME" \
  --description "Medplum Bot Layer" \
  --license-info "Apache-2.0" \
  --compatible-runtimes "nodejs18.x" \
  --zip-file fileb://medplum-bot-layer.zip

# Pop back to original directory
cd ..
