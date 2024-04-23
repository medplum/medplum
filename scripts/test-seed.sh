#!/usr/bin/env bash

# Fail on error
set -e
# Echo commands
set -x

# Testing production path of seeding the database
# This is a special "test" which runs all of the seed logic, such as setting up structure definitions
# On a normal developer machine, this is run only rarely when setting up a new database
# We execute this in parallel with the main line of tests
time npx turbo run test:seed:serial --filter=./packages/server -- --coverage
cp "packages/server/coverage/seed/serial/coverage-final.json" "coverage/packages/coverage-server-seed-serial.json"
