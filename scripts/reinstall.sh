#!/usr/bin/env bash

# Fail on error
set -e

# Echo commands
set -x

rm -rf node_modules

for dir in `ls packages`; do
  if test -d "packages/$dir/node_modules"; then
    rm -rf "packages/$dir/node_modules"
  fi
done

for dir in `ls examples`; do
  if test -d "examples/$dir/node_modules"; then
    rm -rf "examples/$dir/node_modules"
  fi
done

# If called with "--update", then use npm i
if [ "$1" == "--update" ]; then
  rm -rf package-lock.json
  npm i --strict-peer-deps
else
  npm ci --strict-peer-deps
fi
