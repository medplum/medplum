#!/usr/bin/env bash

pushd packages/react
npm run storybook
aws s3 cp storybook-static/ s3://medplum-docs/storybook/ \
  --region us-east-1 \
  --recursive \
  --cache-control "public, max-age=31536000" \
  --exclude "*.html"
aws s3 cp storybook-static/ s3://medplum-docs/storybook/ \
  --region us-east-1 \
  --recursive \
  --cache-control "no-cache" \
  --exclude "*" \
  --include "*.html"
popd
