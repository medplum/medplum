#!/usr/bin/env bash

# Fail on error
set -e
# Echo commands
set -x

# Seed the database before testing
# This is the parallel implementation so it's faster
SHOULD_RUN_SEED_TEST=$(date) time npx turbo run test:seed:parallel --filter=./packages/server -- --coverage
cp "packages/server/coverage/seed/parallel/coverage-final.json" "coverage/packages/coverage-server-seed-parallel.json"

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
