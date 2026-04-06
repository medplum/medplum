#!/usr/bin/env bash

# Fail on error
set -e

# Echo commands
set -x

# Set node options
export NODE_OPTIONS='--max-old-space-size=8192'

# Set coverage flag unless NO_COVERAGE is set
if [ -z "$NO_COVERAGE" ]; then
  COVERAGE_FLAG="--coverage"

  # Clear old code coverage data
  rm -rf coverage
  mkdir -p coverage/packages
  mkdir -p coverage/combined
else
  COVERAGE_FLAG=""
fi

# Build
npm run build

# Seed the database
# This is a special "test" which runs all of the seed logic, such as setting up structure definitions
# On a normal developer machine, this is run only rarely when setting up a new database
# This test must be run first, and cannot be run concurrently with other tests
SHOULD_RUN_SEED_TEST=$(date) time npx turbo run test:seed --filter=./packages/server -- $COVERAGE_FLAG
if [ -z "$NO_COVERAGE" ]; then
  cp "packages/server/coverage/coverage-final.json" "coverage/packages/coverage-server-seed.json"
fi

# Test
# Even though docs do not have a "test" action, we still will build the docs via the
# global "build" job unless we filter it out
npx turbo run test --concurrency=1 --filter=!@medplum/docs --force -- $COVERAGE_FLAG

if [ -z "$NO_COVERAGE" ]; then
  # Find all coverage-final.json files in packages subdirectories
  for coverage_file in packages/*/coverage/coverage-final.json; do
    package=$(echo "$coverage_file" | sed -E 's/packages\/([^/]+)\/coverage.*/\1/')
    cp "$coverage_file" "coverage/packages/coverage-$package.json"
  done

  npx nyc merge coverage/packages coverage/combined/coverage.json
  npx nyc report -t coverage/combined --report-dir coverage --reporter=lcov
fi
