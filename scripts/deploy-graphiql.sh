#!/usr/bin/env bash

pushd packages/graphiql
aws s3 cp dist/ s3://medplum-graphiql/ \
  --profile medplum \
  --region us-east-1 \
  --recursive \
  --acl public-read \
  --cache-control "public, max-age=31536000" \
  --exclude "*.html"
aws s3 cp dist/ s3://medplum-graphiql/ \
  --profile medplum \
  --region us-east-1 \
  --recursive \
  --acl public-read \
  --cache-control "no-cache" \
  --exclude "*" \
  --include "*.html"
popd
