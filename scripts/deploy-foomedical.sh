#!/usr/bin/env bash

if [[ -z "${FOOMEDICAL_BUCKET}" ]]; then
  echo "FOOMEDICAL_BUCKET is missing"
  exit 1
fi

# Fail on error
set -e

# Echo commands
set -x

# Fast upload the foomedical build to S3
node scripts/s3deploy.mjs examples/foomedical/dist "s3://${FOOMEDICAL_BUCKET}"
