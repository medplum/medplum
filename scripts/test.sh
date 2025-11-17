#!/usr/bin/env bash

# Fail on error
set -e

# Echo commands
set -x

# Set node options
export NODE_OPTIONS='--max-old-space-size=8192'

# Clear old code coverage data
rm -rf coverage
mkdir -p coverage/packages
mkdir -p coverage/combined

# Test
# Run them separately because code coverage is resource intensive
# Previously we iterated over the directories in packages/ here and called test on each one, one-by-one
# This didn't actually do what we wanted it to do, since if a package (say @medplum/agent), depends on other packages
# It will try to work through dependencies first
# We can instead reduce overhead of context switching by setting concurrency to 1 and allowing jest to handle concurrency within one test suite
# We leave out the server tests from this batch since (for now) we need to manually run the seed test separately
npx turbo run test --filter=!@medplum/docs --filter=!@medplum/server --concurrency=2

# Seed the database for server tests
# This is a special "test" which runs all of the seed logic, such as setting up structure definitions
# On a normal developer machine, this is run only rarely when setting up a new database
# This test must be run first, and cannot be run concurrently with other tests
SHOULD_RUN_SEED_TEST=$(date) time npx turbo run test:seed --filter=@medplum/server -- --coverage
cp "packages/server/coverage/coverage-final.json" "coverage/packages/coverage-server-seed.json"

# Finally run the rest of the server tests
npx turbo run test --filter=@medplum/server

# Now run tests for all examples
npx turbo run test --filter="./examples/*" --concurrency=2

# Find all coverage-final.json files in packages subdirectories
for coverage_file in packages/*/coverage/coverage-final.json; do
  package=$(echo "$coverage_file" | sed -E 's/packages\/([^/]+)\/coverage.*/\1/')
  cp "$coverage_file" "coverage/packages/coverage-$package.json"
done

npx nyc merge coverage/packages coverage/combined/coverage.json
npx nyc report -t coverage/combined --report-dir coverage --reporter=lcov
