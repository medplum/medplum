#!/usr/bin/env bash

if [[ -z "${FOOMEDICAL_BUCKET}" ]]; then
  echo "FOOMEDICAL_BUCKET is missing"
  exit 1
fi

# Exit on error
set -e

if [[ -z "${MEDPLUM_BASE_URL}" ]]; then
  echo "MEDPLUM_BASE_URL is missing"
  exit 1
fi

# Inject env vars into build output. foomedical.com has its own Google client and reCAPTCHA key, separate from the app's.
find "examples/foomedical/dist" -type f -exec sed -i \
  -e "s|__MEDPLUM_BASE_URL__|${MEDPLUM_BASE_URL}|g" \
  -e "s|__MEDPLUM_CLIENT_ID__||g" \
  -e "s|__GOOGLE_CLIENT_ID__|${FOOMEDICAL_GOOGLE_CLIENT_ID}|g" \
  -e "s|__RECAPTCHA_SITE_KEY__|${FOOMEDICAL_RECAPTCHA_SITE_KEY}|g" \
  {} \;

echo "Environment variable replacement complete."

# Fast upload the build output to S3
node scripts/s3deploy.mjs examples/foomedical/dist "s3://${FOOMEDICAL_BUCKET}"
