#!/usr/bin/env bash

PACKAGES=(
  "agent"
  "app"
  "bot-layer"
  "cdk"
  "cli"
  "core"
  "definitions"
  "eslint-config"
  "expo-polyfills"
  "fhir-router"
  "fhirtypes"
  "health-gorilla"
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
