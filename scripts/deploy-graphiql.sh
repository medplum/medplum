#!/usr/bin/env bash

pushd packages/graphiql
aws s3 cp dist/ s3://medplum-docs/graphiql/ \
  --profile medplum \
  --region us-east-1 \
  --recursive \
  --cache-control "public, max-age=31536000" \
  --exclude "*.html"
aws s3 cp dist/ s3://medplum-docs/graphiql/ \
  --profile medplum \
  --region us-east-1 \
  --recursive \
  --cache-control "no-cache" \
  --exclude "*" \
  --include "*.html"
popd
