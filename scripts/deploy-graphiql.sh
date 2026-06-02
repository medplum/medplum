#!/usr/bin/env bash

if [[ -z "${GRAPHIQL_BUCKET}" ]]; then
  echo "GRAPHIQL_BUCKET is missing"
  exit 1
fi

# Fast upload the build output to S3
node scripts/s3deploy.mjs packages/graphiql/dist "s3://${GRAPHIQL_BUCKET}/"
