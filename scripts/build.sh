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
npm run build --workspace=packages/app
npm run build --workspace=packages/graphiql
npm run build --workspace=packages/server

# Test
NODE_OPTIONS=--max_old_space_size=2048 npx jest --runInBand

# Lint
npm run lint --workspaces

# Build server tar
tar -czf medplum-server.tar.gz \
  package.json \
  package-lock.json \
  packages/core/package.json \
  packages/core/dist \
  packages/definitions/package.json \
  packages/definitions/dist \
  packages/server/package.json \
  packages/server/dist \
  packages/server/templates
