#!/usr/bin/env bash

pushd packages/console
aws s3 cp dist/ s3://medplum-console/ --profile medplum --region us-east-1 --recursive
popd
