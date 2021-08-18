#!/usr/bin/env bash

# CI/CD build script

# Fail on error
set -e

# Echo commands
set -x

# Diagnostics
node --version
npm --version

# Install
[ ! -d "node_modules" ] && npm ci

# Build
npm run build --workspace=packages/definitions
npm run build --workspace=packages/core
npm run build --workspace=packages/ui
npm run build --workspace=packages/console
npm run build --workspace=packages/graphiql
npm run build --workspace=packages/server

# Test
npx jest --runInBand

