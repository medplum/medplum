#!/usr/bin/env bash

PACKAGES=(
  "server"
)

for package in ${PACKAGES[@]}; do
  echo "Publish $package"
  pushd packages/$package
  npm publish
  popd
done
