#!/usr/bin/env bash

set -xe

# Optional npm dist-tag; a backport must not take "latest" from a newer release
PUBLISH_ARGS=(--provenance --access public)
if [ -n "$1" ]; then
  PUBLISH_ARGS+=(--tag "$1")
fi

PACKAGES=(
  "agent"
  "app"
  "bot-layer"
  "ccda"
  "cdk"
  "cli"
  "cli-wrapper"
  "core"
  "create-medplum"
  "definitions"
  "dosespot-core"
  "dosespot-react"
  "eslint-config"
  "fhir-router"
  "fhirtypes"
  "health-gorilla-core"
  "health-gorilla-react"
  "hl7"
  "mock"
  "react"
  "react-hooks"
  "react-scheduling"
  "scriptsure-react"
)

for package in "${PACKAGES[@]}"; do
  echo "Publish $package"
  pushd "packages/$package"
  cp ../../LICENSE.txt .
  cp ../../NOTICE .

  NAME=$(node -p "require('./package.json').name")
  VERSION=$(node -p "require('./package.json').version")

  if npm view --prefer-online "$NAME@$VERSION" version >/dev/null 2>&1; then
    echo "$NAME@$VERSION already published; skipping"
  else
    for attempt in 1 2 3; do
      npm publish "${PUBLISH_ARGS[@]}" && break

      if npm view --prefer-online "$NAME@$VERSION" version >/dev/null 2>&1; then
        echo "$NAME@$VERSION is published despite the error; continuing"
        break
      fi

      if [ "$attempt" = 3 ]; then
        exit 1
      fi

      sleep $((attempt * 5))
    done
  fi

  popd
done
