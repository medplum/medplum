#!/usr/bin/env bash

if [[ -z "${STORYBOOK_BUCKET}" ]]; then
  echo "STORYBOOK_BUCKET is missing"
  exit 1
fi

# Fail on error
set -e

# Echo commands
set -x

# Fast upload the docs to S3
node scripts/s3deploy.mjs packages/storybook/storybook-static "s3://${STORYBOOK_BUCKET}"
