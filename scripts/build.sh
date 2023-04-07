#!/usr/bin/env bash

# CI/CD build script

# Fail on error
set -e

# Echo commands
set -x

# Set node options
export NODE_OPTIONS='--max-old-space-size=4096'

# Diagnostics
node --version
npm --version

# Install
[ ! -d "node_modules" ] && npm ci

# Build
npx turbo run build

# Test
npx turbo run test -- --coverage

# Combine test coverage
rm -rf coverage
mkdir -p coverage/packages
mkdir -p coverage/combined
cp packages/app/coverage/coverage-final.json coverage/packages/coverage-app.json
cp packages/cdk/coverage/coverage-final.json coverage/packages/coverage-cdk.json
cp packages/cli/coverage/coverage-final.json coverage/packages/coverage-cli.json
cp packages/core/coverage/coverage-final.json coverage/packages/coverage-core.json
cp packages/fhir-router/coverage/coverage-final.json coverage/packages/coverage-fhir-router.json
cp packages/mock/coverage/coverage-final.json coverage/packages/coverage-mock.json
cp packages/react/coverage/coverage-final.json coverage/packages/coverage-react.json
cp packages/server/coverage/coverage-final.json coverage/packages/coverage-server.json
npx nyc merge coverage/packages coverage/combined/coverage.json
npx nyc report -t coverage/combined --report-dir coverage --reporter=lcov

# Lint
npm run lint
