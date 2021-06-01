#!/usr/bin/env bash

# CI/CD build script

# Fail on error
set -e

# Echo commands
set -x

# Test all
npx jest
