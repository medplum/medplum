#!/usr/bin/env bash

PACKAGES=(
  "@data2evidence/d2e-medplum"
)

for package in ${PACKAGES[@]}; do
  echo "Publish $package"
  pushd packages/$package
  npm publish
  popd
done
