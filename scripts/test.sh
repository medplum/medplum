#!/usr/bin/env bash

# Fail on error
set -e

# Echo commands
set -x

# Set node options
export NODE_OPTIONS='--max-old-space-size=8192'

# Clear old code coverage data
rm -rf coverage
mkdir -p coverage/packages
mkdir -p coverage/combined
mkdir -p coverage/seed/serial
mkdir -p coverage/seed/parallel

npx concurrently -n seed,main --kill-others-on-fail "scripts/test-seed.sh" "scripts/test-main.sh"

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
