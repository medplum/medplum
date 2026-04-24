#!/usr/bin/env bash

if [[ -z "${APP_BUCKET}" ]]; then
  echo "APP_BUCKET is missing"
  exit 1
fi

# Exit on error
set -e

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
# TODO: Could this be done as part of s3deploy.mjs?
find "packages/app/dist" -type f -exec sed -i \
  -e "s|__MEDPLUM_BASE_URL__|${MEDPLUM_BASE_URL}|g" \
  -e "s|__MEDPLUM_CLIENT_ID__||g" \
  -e "s|__GOOGLE_CLIENT_ID__|${GOOGLE_CLIENT_ID}|g" \
  -e "s|__RECAPTCHA_SITE_KEY__|${RECAPTCHA_SITE_KEY}|g" \
  -e "s|__MEDPLUM_REGISTER_ENABLED__|${MEDPLUM_REGISTER_ENABLED}|g" \
  -e "s|__MEDPLUM_AWS_TEXTRACT_ENABLED__|${MEDPLUM_AWS_TEXTRACT_ENABLED}|g" \
  {} \;

echo "Environment variable replacement complete."

# Fast upload the build output to S3
node scripts/s3deploy.mjs packages/app/dist "s3://${APP_BUCKET}"
