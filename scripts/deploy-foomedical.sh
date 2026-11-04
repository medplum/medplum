#!/usr/bin/env bash

if [[ -z "${FOOMEDICAL_BUCKET}" ]]; then
  echo "FOOMEDICAL_BUCKET is missing"
  exit 1
fi

# Exit on error
set -e

if [[ -z "${FOOMEDICAL_BASE_URL}" ]]; then
  echo "FOOMEDICAL_BASE_URL is missing"
  exit 1
fi

if [[ -z "${FOOMEDICAL_PROJECT_ID}" ]]; then
  echo "FOOMEDICAL_PROJECT_ID is missing"
  exit 1
fi

# Inject deployment configuration into the build output.
find "examples/foomedical/dist" -type f -exec sed -i \
  -e "s|__MEDPLUM_BASE_URL__|${FOOMEDICAL_BASE_URL}|g" \
  -e "s|__FOOMEDICAL_PROJECT_ID__|${FOOMEDICAL_PROJECT_ID}|g" \
  -e "s|__MEDPLUM_CLIENT_ID__||g" \
  -e "s|__GOOGLE_CLIENT_ID__|${FOOMEDICAL_GOOGLE_CLIENT_ID}|g" \
  -e "s|__RECAPTCHA_SITE_KEY__|${FOOMEDICAL_RECAPTCHA_SITE_KEY}|g" \
  {} \;

echo "Environment variable replacement complete."

# Fast upload the build output to S3
node scripts/s3deploy.mjs examples/foomedical/dist "s3://${FOOMEDICAL_BUCKET}"
