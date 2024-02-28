#!/usr/bin/env bash

# CI/CD docs build script

# Fail on error
set -e

# Echo commands
set -x

# Set node options
export NODE_OPTIONS='--max-old-space-size=8192'

# Diagnostics
node --version
npm --version

# Install
[ ! -d "node_modules" ] && npm ci --maxsockets 1

# Build
npm run build:docs
