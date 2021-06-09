#!/usr/bin/env bash

pushd packages/ui
npm run storybook
aws s3 cp storybook-static/ s3://medplum-storybook/ \
  --profile medplum \
  --region us-east-1 \
  --recursive \
  --acl public-read \
  --cache-control "public, max-age=31536000" \
  --exclude "*.html"
aws s3 cp storybook-static/ s3://medplum-storybook/ \
  --profile medplum \
  --region us-east-1 \
  --recursive \
  --acl public-read \
  --cache-control "no-cache" \
  --exclude "*" \
  --include "*.html"
popd
