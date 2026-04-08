#!/usr/bin/env bash

# Fail on error
set -e

# Echo commands
set -x

# Set node options
export NODE_OPTIONS='--max-old-space-size=8192'

# Build examples and their dependencies
# TODO: tmp comment this out since we are doing force below for testing
# npx turbo run build --filter='./examples/*'

# Test examples with no coverage
npx turbo run test --concurrency=3 --filter='./examples/*' --force
