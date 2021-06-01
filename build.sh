#!/usr/bin/env bash

# CI/CD build script

# Fail on error
set -e

# Echo commands
set -x

# Test core
npm t --workspace=packages/core

# Test server
npm t --workspace=packages/server
