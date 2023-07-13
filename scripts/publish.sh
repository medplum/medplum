#!/usr/bin/env bash

PACKAGES=("app" "bot-layer" "cdk" "cli" "core" "definitions" "eslint-config" "fhir-router" "fhirtypes" "mock" "react")
for package in ${PACKAGES[@]}; do
  echo "Publish $package"
  pushd packages/$package
  npm publish --access public
  popd
done
