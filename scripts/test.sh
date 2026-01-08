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

# Seed the database
# This is a special "test" which runs all of the seed logic, such as setting up structure definitions
# On a normal developer machine, this is run only rarely when setting up a new database
# This test must be run first, and cannot be run concurrently with other tests
SHOULD_RUN_SEED_TEST=$(date) time npx turbo run test:seed --filter=./packages/server -- --coverage
cp "packages/server/coverage/coverage-final.json" "coverage/packages/coverage-server-seed.json"

# Test
# Run them separately because code coverage is resource intensive

for dir in `ls packages`; do
  if test -f "packages/$dir/package.json" && grep -q "\"test\":" "packages/$dir/package.json"; then
    npx turbo run test --filter=./packages/$dir -- --coverage
  fi
done

for dir in `ls examples`; do
  if test -f "examples/$dir/package.json" && grep -q "\"test\":" "examples/$dir/package.json"; then
    npx turbo run test --filter=./examples/$dir
  fi
done

# Find all coverage-final.json files in packages subdirectories
for coverage_file in packages/*/coverage/coverage-final.json; do
  package=$(echo "$coverage_file" | sed -E 's/packages\/([^/]+)\/coverage.*/\1/')
  cp "$coverage_file" "coverage/packages/coverage-$package.json"
done

npx nyc merge coverage/packages coverage/combined/coverage.json
npx nyc report -t coverage/combined --report-dir coverage --reporter=lcov
