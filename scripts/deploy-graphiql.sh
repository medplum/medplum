#!/usr/bin/env bash

pushd packages/graphiql
aws s3 cp dist/ s3://medplum-graphiql/ --profile medplum --region us-east-1 --recursive
popd
