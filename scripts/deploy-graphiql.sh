#!/usr/bin/env bash

pushd packages/graphiql

# No cache

aws s3 cp dist/ s3://graphiql.medplum.com/ \
  --region us-east-1 \
  --recursive \
  --content-type "text/html" \
  --cache-control "no-cache" \
  --exclude "*" \
  --include "*.html"

# Cache forever

aws s3 cp dist/ s3://graphiql.medplum.com/ \
  --region us-east-1 \
  --recursive \
  --content-type "text/css" \
  --cache-control "public, max-age=31536000" \
  --exclude "*" \
  --include "*.css"

aws s3 cp dist/ s3://graphiql.medplum.com/ \
  --region us-east-1 \
  --recursive \
  --content-type "text/javascript" \
  --cache-control "public, max-age=31536000" \
  --exclude "*" \
  --include "*.js"

aws s3 cp dist/ s3://graphiql.medplum.com/ \
  --recursive \
  --content-type "application/json" \
  --cache-control "public, max-age=31536000" \
  --exclude "*" \
  --include "*.map"

aws s3 cp dist/ s3://graphiql.medplum.com/ \
  --region us-east-1 \
  --recursive \
  --content-type "text/plain" \
  --cache-control "public, max-age=31536000" \
  --exclude "*" \
  --include "*.txt"

popd
