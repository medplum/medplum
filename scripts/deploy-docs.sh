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
# Pages are cached briefly by browsers and refreshed in the background; CloudFront still revalidates every request
node scripts/s3deploy.mjs packages/docs/public "s3://${DOCS_DESTINATION}" \
  --html-cache-control="public, max-age=300, s-maxage=0, stale-while-revalidate=86400"
