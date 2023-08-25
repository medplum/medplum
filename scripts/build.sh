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
# Run them separately because code coverage is resource intensive

for dir in `ls packages`; do
  if test -f "packages/$dir/package.json" && grep -q "\"test\":" "packages/$dir/package.json"; then
    pushd "packages/$dir"
    npm run test -- --coverage
    popd
  fi
done

for dir in `ls examples`; do
  if test -f "examples/$dir/package.json" && grep -q "\"test\":" "examples/$dir/package.json"; then
    pushd "examples/$dir"
    npm run test
    popd
  fi
done


# Combine test coverage
rm -rf coverage
mkdir -p coverage/packages
mkdir -p coverage/combined

PACKAGES=(
  "agent"
  "app"
  "cdk"
  "cli"
  "core"
  "fhir-router"
  "hl7"
  "mock"
  "react"
  "server"
)

for package in ${PACKAGES[@]}; do
  cp "packages/$package/coverage/coverage-final.json" "coverage/packages/coverage-$package.json"
done

npx nyc merge coverage/packages coverage/combined/coverage.json
npx nyc report -t coverage/combined --report-dir coverage --reporter=lcov

# Agent installer
pushd packages/agent
npm run package
npm run installer
ls -la dist
popd

# Lint
npm run lint
