#!/usr/bin/env bash

if [[ -z "${DOCS_DESTINATION}" ]]; then
  echo "DOCS_DESTINATION is missing"
  exit 1
fi

# Fail on error
set -e

# Echo commands
set -x

# Fast upload the docs to S3
node scripts/s3deploy.mjs packages/docs/build "s3://${DOCS_DESTINATION}"

# Regenerate the CSP from the build we just shipped. Docusaurus inlines scripts
# whose hashes change with its version, our config, and the redirect list, so a
# stale policy would block them. This only writes the file; applying it to
# CloudFront is a deliberate step. See medplum/medplum-ee#1087.
node scripts/generate-csp.mjs --out packages/docs/csp-policy.json
