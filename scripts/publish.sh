#!/usr/bin/env bash

OTP=$1
if [[ -z "$OTP" ]]; then
  echo "Usage: publish.sh [2fa-token]"
  exit 1
fi

PACKAGES=("cli" "core" "definitions" "fhirtypes" "mock" "react")
for package in ${PACKAGES[@]}; do
  echo "Publish $package"
  pushd packages/$package
  npm publish --access public --otp=$OTP
  popd
done
