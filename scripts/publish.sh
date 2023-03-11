#!/usr/bin/env bash

PACKAGES=("cdk" "cli" "core" "definitions" "fhir-router" "fhirtypes" "mock" "react")
for package in ${PACKAGES[@]}; do
  echo "Publish $package"
  pushd packages/$package
  npm publish --access public
  popd
done
