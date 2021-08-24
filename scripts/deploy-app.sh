#!/usr/bin/env bash

pushd packages/app
aws s3 cp dist/ s3://app.medplum.com/ \
  --profile medplum \
  --region us-east-1 \
  --recursive \
  --cache-control "public, max-age=31536000" \
  --exclude "*.html"
aws s3 cp dist/ s3://app.medplum.com/ \
  --profile medplum \
  --region us-east-1 \
  --recursive \
  --cache-control "no-cache" \
  --exclude "*" \
  --include "*.html"
popd
