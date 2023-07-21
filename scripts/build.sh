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

# Lint
npm run lint
