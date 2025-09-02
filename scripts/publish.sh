#!/usr/bin/env bash

PACKAGES=(
  "ccda"
  "core"
  "definitions"
  "fhir-router"
  "fhirtypes"
  "server"
)

for package in ${PACKAGES[@]}; do
  echo "Publish $package"
  pushd packages/$package
  npm publish
  popd
done
