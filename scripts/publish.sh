#!/usr/bin/env bash

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
)

for package in ${PACKAGES[@]}; do
  echo "Publish $package"
  pushd packages/$package
  npm publish --access public
  popd
done
