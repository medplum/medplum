#!/usr/bin/env bash

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

# Move into the temporary directory
cd tmp/nodejs/

# Install dependencies
npm install --omit=dev --omit=optional

# Go up one directory to the temp directory
# The zip file must be in the parent directory.
cd ..

# Create the zip file
zip -r medplum-bot-layer.zip .

# Publish the bot layer
aws lambda publish-layer-version \
  --region us-east-1 \
  --layer-name "medplum-bot-layer" \
  --description "Medplum Bot Layer" \
  --license-info "Apache-2.0" \
  --compatible-runtimes "nodejs16.x" \
  --zip-file fileb://medplum-bot-layer.zip

# Pop back to original directory
cd ..
