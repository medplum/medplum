#!/usr/bin/env bash

# CI/CD build script

# Fail on error
set -e

# Echo commands
set -x

# Set node options
export NODE_OPTIONS='--max-old-space-size=5120'

# Diagnostics
node --version
npm --version

# Install
[ ! -d "node_modules" ] && npm ci --maxsockets 1

# Build
npm run build:all

# Lint
npm run lint
