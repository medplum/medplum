#!/usr/bin/env bash

# CI/CD build script

# Fail on error
set -e

# Echo commands
set -x

# Diagnostics
node --version
npm --version

# Install
[ ! -d "node_modules" ] && npm ci

# Build
npm run build --workspace=packages/definitions
npm run build --workspace=packages/fhirpath
npm run build --workspace=packages/core
npm run build --workspace=packages/mock
npm run build --workspace=packages/ui
npm run build --workspace=packages/app
npm run build --workspace=packages/graphiql
npm run build --workspace=packages/server
npm run build --workspace=packages/docs

# Test
#npx jest --runInBand
node --expose-gc --trace-uncaught --max_old_space_size=4096 ./node_modules/jest/bin/jest.js --runInBand --logHeapUsage

# Lint
npm run lint
