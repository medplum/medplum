#!/usr/bin/env bash

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
  "react-hooks"
  "server"
)

for package in ${PACKAGES[@]}; do
  cp "packages/$package/coverage/coverage-final.json" "coverage/packages/coverage-$package.json"
done

npx nyc merge coverage/packages coverage/combined/coverage.json
npx nyc report -t coverage/combined --report-dir coverage --reporter=lcov
