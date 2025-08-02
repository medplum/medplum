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
