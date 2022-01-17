#!/usr/bin/env bash

PACKAGES=("core" "definitions" "fhirpath" "fhirtypes" "mock" "ui")
for package in ${PACKAGES[@]}; do
  echo "Publish $package"
  pushd packages/$package
  npm publish --access public
  popd
done
