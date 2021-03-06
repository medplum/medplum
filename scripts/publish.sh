#!/usr/bin/env bash

PACKAGES=("cli" "core" "definitions" "fhirtypes" "mock" "react")
for package in ${PACKAGES[@]}; do
  echo "Publish $package"
  pushd packages/$package
  npm publish --access public
  popd
done
