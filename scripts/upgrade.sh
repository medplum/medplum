#!/usr/bin/env bash

EXCLUDE="@mantine/* hibp node-fetch"

npx npm-check-updates -u -x "$EXCLUDE" --packageFile package.json

for dir in `ls packages`; do
  if test -f "packages/$dir/package.json"; then
    npx npm-check-updates -u -x "$EXCLUDE" --packageFile "packages/$dir/package.json"
  fi
done

for dir in `ls examples`; do
  if test -f "examples/$dir/package.json"; then
    npx npm-check-updates -u -x "$EXCLUDE" --packageFile "examples/$dir/package.json"
  fi
done
