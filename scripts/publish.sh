#!/usr/bin/env bash

pushd packages/core
npm publish --access public
popd

pushd packages/definitions
npm publish --access public
popd

pushd packages/ui
npm publish --access public
popd
