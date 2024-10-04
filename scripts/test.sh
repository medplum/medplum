#!/usr/bin/env bash

# Fail on error
set -e

# Echo commands
set -x

# Set node options
export NODE_OPTIONS='--max-old-space-size=5120'

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
npx turbo run test -- --coverage

# Combine test coverage
PACKAGES=(
  "agent"
  "app"
  "cdk"
  "cli"
  "core"
  "expo-polyfills"
  "fhir-router"
  "health-gorilla-core"
  "health-gorilla-react"
  "hl7"
  "mock"
  "react"
  "react-hooks"
  "server"
)

for package in ${PACKAGES[@]}; do
  cp "packages/$package/coverage/coverage-final.json" "coverage/packages/coverage-$package.json"
done

npx nyc merge coverage/packages coverage/combined/coverage.json
npx nyc report -t coverage/combined --report-dir coverage --reporter=lcov
