#!/usr/bin/env bash

# Fail on error
set -e

# Echo commands
set -x

# Set node options
export NODE_OPTIONS='--max-old-space-size=8192'

# Set coverage flags unless NO_COVERAGE is set
if [ -z "$NO_COVERAGE" ]; then
  # The blob reporter records each package's results and coverage for the merge step below.
  COVERAGE_FLAGS="--coverage --reporter=default --reporter=blob"

  # The seed run shares a package with the main server run, so it writes to its own blob
  # file. Sharing the default path lets a leftover seed blob stand in for the server blob.
  SEED_COVERAGE_FLAGS="$COVERAGE_FLAGS --outputFile.blob=.vitest-reports/blob-seed.json"

  # Clear old code coverage data
  rm -rf coverage .vitest-reports packages/*/.vitest-reports
  mkdir -p .vitest-reports
else
  COVERAGE_FLAGS=""
  SEED_COVERAGE_FLAGS=""
fi

# Seed the database
# This is a special "test" which runs all of the seed logic, such as setting up structure definitions
# On a normal developer machine, this is run only rarely when setting up a new database
# This test must be run first, and cannot be run concurrently with other tests
SHOULD_RUN_SEED_TEST=$(date) time npx turbo run test:seed --filter=./packages/server -- $SEED_COVERAGE_FLAGS
if [ -z "$NO_COVERAGE" ]; then
  cp "packages/server/.vitest-reports/blob-seed.json" ".vitest-reports/blob-server-seed.json"
fi

# Test
# Even though docs do not have a "test" action, we still will build the docs via the
# global "build" job unless we filter it out
npx turbo run test --concurrency=1 --filter='!@medplum/docs' --filter='!./examples/*' -- $COVERAGE_FLAGS

if [ -z "$NO_COVERAGE" ]; then
  # A package missing its blob drops out of the merged report entirely, which reads as a
  # healthy percentage rather than a failure. The usual cause is a turbo cache hit for a
  # task whose "outputs" omit .vitest-reports, so nothing gets restored.
  if [ ! -f "packages/server/.vitest-reports/blob.json" ]; then
    echo "error: packages/server produced no blob; check the test task 'outputs' in packages/server/turbo.json" >&2
    exit 1
  fi

  # Gather every package blob into one directory, which is all --merge-reports accepts.
  # Blobs are matched back to the root config's projects by name, hence the explicit
  # "test.name" in each package config.
  for blob in packages/*/.vitest-reports/blob.json; do
    package=$(echo "$blob" | sed -E 's/packages\/([^/]+)\/.*/\1/')
    cp "$blob" ".vitest-reports/blob-$package.json"
  done

  npx vitest run --merge-reports .vitest-reports --coverage
fi
