#!/usr/bin/env bash

npx npm-check-updates -u --packageFile package.json

for dir in `ls packages`; do
  if test -f "packages/$dir/package.json"; then
    npx npm-check-updates -u --packageFile "packages/$dir/package.json"
  fi
done

for dir in `ls examples`; do
  if test -f "examples/$dir/package.json"; then
    npx npm-check-updates -u --packageFile "examples/$dir/package.json"
  fi
done
