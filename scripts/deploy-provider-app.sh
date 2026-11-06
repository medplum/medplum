#!/usr/bin/env bash

if [[ -z "${PROVIDER_APP_BUCKET}" ]]; then
  echo "PROVIDER_APP_BUCKET is missing"
  exit 1
fi

# Exit on error
set -e

if [[ -z "${MEDPLUM_BASE_URL}" ]]; then
  echo "MEDPLUM_BASE_URL is missing"
  exit 1
fi

# The minifier folds `x || "__MEDPLUM_PROJECT_ID__" || undefined` to `x || "__MEDPLUM_PROJECT_ID__"`,
# so with no project configured, replace the whole string literal with `undefined`, not an empty string
if [[ -n "${PROVIDER_PROJECT_ID}" ]]; then
  PROJECT_ID_REPLACEMENT="s|__MEDPLUM_PROJECT_ID__|${PROVIDER_PROJECT_ID}|g"
else
  PROJECT_ID_REPLACEMENT="s|[\"'\`]__MEDPLUM_PROJECT_ID__[\"'\`]|undefined|g"
fi

# Inject env vars into build output
find "examples/medplum-provider/dist" -type f -exec sed -i \
  -e "s|__MEDPLUM_BASE_URL__|${MEDPLUM_BASE_URL}|g" \
  -e "s|__MEDPLUM_CLIENT_ID__||g" \
  -e "s|__GOOGLE_CLIENT_ID__|${GOOGLE_CLIENT_ID}|g" \
  -e "s|__RECAPTCHA_SITE_KEY__|${RECAPTCHA_SITE_KEY}|g" \
  -e "${PROJECT_ID_REPLACEMENT}" \
  {} \;

echo "Environment variable replacement complete."

# Fast upload the build output to S3
node scripts/s3deploy.mjs examples/medplum-provider/dist "s3://${PROVIDER_APP_BUCKET}"
