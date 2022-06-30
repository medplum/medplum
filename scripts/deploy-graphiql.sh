#!/usr/bin/env bash

pushd packages/graphiql
aws s3 cp dist/ s3://medplum-docs/graphiql/ \
  --region us-east-1 \
  --recursive \
  --cache-control "public, max-age=31536000" \
  --exclude "*.html" \
  --exclude "*.css" \
  --exclude "*.js"
aws s3 cp dist/ s3://medplum-docs/graphiql/ \
  --region us-east-1 \
  --recursive \
  --content-type "text/html" \
  --cache-control "no-cache" \
  --exclude "*" \
  --include "*.html"
aws s3 cp dist/ s3://medplum-docs/graphiql/ \
  --region us-east-1 \
  --recursive \
  --content-type "text/css" \
  --cache-control "no-cache" \
  --exclude "*" \
  --include "*.css"
aws s3 cp dist/ s3://medplum-docs/graphiql/ \
  --region us-east-1 \
  --recursive \
  --content-type "application/javascript" \
  --cache-control "no-cache" \
  --exclude "*" \
  --include "*.js"
popd
