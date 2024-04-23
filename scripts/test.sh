#!/usr/bin/env bash

# Fail on error
set -e

# Echo commands
set -x

# Set node options
export NODE_OPTIONS='--max-old-space-size=8192'

# Clear old code coverage data
rm -rf coverage
rm -rf coverage-seed
mkdir -p coverage/packages
mkdir -p coverage/combined
mkdir -p coverage-seed/serial
mkdir -p coverage-seed/parallel

# Testing production path of seeding the database
# This is a special "test" which runs all of the seed logic, such as setting up structure definitions
# On a normal developer machine, this is run only rarely when setting up a new database
# We execute this in parallel with the main line of tests
{
  time npx turbo run test:seed:serial --filter=./packages/server -- --coverage
  cp "packages/server/coverage-seed/serial/coverage-final.json" "coverage/packages/coverage-server-seed-serial.json"
} &

# Seed the database before testing
# This is the parallel implementation so it's faster
# This test must be run first, and cannot be run concurrently with other tests
SHOULD_RUN_SEED_TEST=$(date) time npx turbo run test:seed:parallel --filter=./packages/server -- --coverage
cp "packages/server/coverage-seed/parallel/coverage-final.json" "coverage/packages/coverage-server-seed-parallel.json"

# Test
# Run them separately because code coverage is resource intensive

for dir in `ls packages`; do
  if test -f "packages/$dir/package.json" && grep -q "\"test\":" "packages/$dir/package.json"; then
    npx turbo run test --filter=./packages/$dir -- --coverage
  fi
done

for dir in `ls examples`; do
  if test -f "examples/$dir/package.json" && grep -q "\"test\":" "examples/$dir/package.json"; then
    npx turbo run test --filter=./packages/$dir
  fi
done

wait

# Combine test coverage
PACKAGES=(
  "agent"
  "app"
  "cdk"
  "cli"
  "core"
  "expo-polyfills"
  "fhir-router"
  "health-gorilla"
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
