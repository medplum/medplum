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

# Inject env vars into build output
find "examples/medplum-provider/dist" -type f -exec sed -i \
  -e "s|__MEDPLUM_BASE_URL__|${MEDPLUM_BASE_URL}|g" \
  {} \;

echo "Environment variable replacement complete."

# Fast upload the build output to S3
node scripts/s3deploy.mjs examples/medplum-provider/dist "s3://${PROVIDER_APP_BUCKET}"
