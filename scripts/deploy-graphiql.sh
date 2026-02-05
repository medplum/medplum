#!/usr/bin/env bash

# Fast upload the build output to S3
node scripts/s3deploy.mjs packages/graphiql/dist "s3://graphiql.medplum.com/"
