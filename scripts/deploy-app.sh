#!/usr/bin/env bash

if [[ -z "${APP_BUCKET}" ]]; then
  echo "APP_BUCKET is missing"
  exit 1
fi

# Exit on error
set -e

pushd packages/app

# Check that all required variables are set to avoid missing env vars not set in deploy.yml
if [[ -z "${MEDPLUM_BASE_URL}" ]]; then
  echo "MEDPLUM_BASE_URL is missing"
  exit 1
fi

# Setting defaults for the replacements of placeholders which should have defaults
: ${GOOGLE_CLIENT_ID:=""}
: ${RECAPTCHA_SITE_KEY:=""}
: ${MEDPLUM_REGISTER_ENABLED:="true"}
: ${MEDPLUM_AWS_TEXTRACT_ENABLED:="true"}

# Inject the env vars into our build output
# Find all JS files in the assets directory
# Update the app config
# Recursively apply to all text files in the app dist directory
find "./dist" -type f -exec sed -i \
  -e "s|__MEDPLUM_BASE_URL__|${MEDPLUM_BASE_URL}|g" \
  -e "s|__MEDPLUM_CLIENT_ID__||g" \
  -e "s|__GOOGLE_CLIENT_ID__|${GOOGLE_CLIENT_ID}|g" \
  -e "s|__RECAPTCHA_SITE_KEY__|${RECAPTCHA_SITE_KEY}|g" \
  -e "s|__MEDPLUM_REGISTER_ENABLED__|${MEDPLUM_REGISTER_ENABLED}|g" \
  -e "s|__MEDPLUM_AWS_TEXTRACT_ENABLED__|${MEDPLUM_AWS_TEXTRACT_ENABLED}|g" \
  {} \;

echo "Environment variable replacement complete."

# First deploy hashed files that are cached forever
# It is important to deploy these files first,
# because they are referenced by the index.html file.
# If a user attempts to download a hashed file that doesn't exist,
# it can cause a bad cache entry in CloudFront.

aws s3 cp dist/ "s3://${APP_BUCKET}/" \
  --recursive \
  --content-type "text/css" \
  --cache-control "public, max-age=31536000" \
  --exclude "*" \
  --include "*.css"

aws s3 cp dist/ "s3://${APP_BUCKET}/" \
  --recursive \
  --content-type "text/javascript" \
  --cache-control "public, max-age=31536000" \
  --exclude "*" \
  --include "*.js"

aws s3 cp dist/ "s3://${APP_BUCKET}/" \
  --recursive \
  --content-type "application/json" \
  --cache-control "public, max-age=31536000" \
  --exclude "*" \
  --include "*.map"

aws s3 cp dist/ "s3://${APP_BUCKET}/" \
  --recursive \
  --content-type "text/plain" \
  --cache-control "public, max-age=31536000" \
  --exclude "*" \
  --include "*.txt"

aws s3 cp dist/ "s3://${APP_BUCKET}/" \
  --recursive \
  --content-type "image/x-icon" \
  --cache-control "public, max-age=31536000" \
  --exclude "*" \
  --include "*.ico"

aws s3 cp dist/ "s3://${APP_BUCKET}/" \
  --recursive \
  --content-type "image/png" \
  --cache-control "public, max-age=31536000" \
  --exclude "*" \
  --include "*.png"

aws s3 cp dist/ "s3://${APP_BUCKET}/" \
  --recursive \
  --content-type "image/svg+xml" \
  --cache-control "public, max-age=31536000" \
  --exclude "*" \
  --include "*.svg"

# Now deploy named files that are not cached.
# These are small lightweight files that are not hashed.
# It is important to deploy these files last,
# because they reference the previously uploaded hashed files.

aws s3 cp dist/ "s3://${APP_BUCKET}/" \
  --recursive \
  --content-type "text/html" \
  --cache-control "no-cache" \
  --exclude "*" \
  --include "*.html"

popd
