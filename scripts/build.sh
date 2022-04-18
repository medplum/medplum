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
BUILD_ORDER=("definitions" "fhirpath" "core" "mock" "ui" "app" "graphiql" "server" "infra" "docs")
for PACKAGE in ${BUILD_ORDER[@]}; do
  pushd "packages/$PACKAGE"
  npm run build
  popd
done

# Test
TEST_ORDER=("fhirpath" "core" "mock" "ui" "app" "infra")
for PACKAGE in ${TEST_ORDER[@]}; do
  pushd "packages/$PACKAGE"
  npm t
  popd
done

# Server has special test configuration
pushd "packages/server"
node --expose-gc --trace-uncaught --max_old_space_size=4096 ../../node_modules/jest/bin/jest.js --runInBand --logHeapUsage
popd

# Combine test coverage
rm -rf coverage
mkdir -p coverage/packages
mkdir -p coverage/combined
cp packages/app/coverage/coverage-final.json coverage/packages/coverage-app.json
cp packages/core/coverage/coverage-final.json coverage/packages/coverage-core.json
cp packages/fhirpath/coverage/coverage-final.json coverage/packages/coverage-fhirpath.json
cp packages/infra/coverage/coverage-final.json coverage/packages/coverage-infra.json
cp packages/mock/coverage/coverage-final.json coverage/packages/coverage-mock.json
cp packages/server/coverage/coverage-final.json coverage/packages/coverage-server.json
cp packages/ui/coverage/coverage-final.json coverage/packages/coverage-ui.json
npx nyc merge coverage/packages coverage/combined/coverage.json
npx nyc report -t coverage/combined --report-dir coverage --reporter=lcov

# Lint
npm run lint
