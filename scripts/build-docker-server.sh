#!/usr/bin/env bash

if [[ -z "${SERVER_DOCKERHUB_REPOSITORY}" ]]; then
  echo "SERVER_DOCKERHUB_REPOSITORY is missing"
  exit 1
fi

if [[ -z "${GITHUB_SHA}" ]]; then
  echo "GITHUB_SHA is missing"
  exit 1
fi

# Fail on error
set -e

# Echo commands
set -x

# Build server tarball
tar \
  --no-xattrs \
  --exclude='*.ts' \
  --exclude='*.tsbuildinfo' \
  -czf medplum-server.tar.gz \
  package.json \
  package-lock.json \
  packages/bot-layer/package.json \
  packages/ccda/package.json \
  packages/ccda/dist \
  packages/core/package.json \
  packages/core/dist \
  packages/definitions/package.json \
  packages/definitions/dist \
  packages/fhir-router/package.json \
  packages/fhir-router/dist \
  packages/server/package.json \
  packages/server/dist \
  packages/server/static

# Supply chain attestations
# See: https://docs.docker.com/scout/policy/#supply-chain-attestations
ATTESTATIONS="--provenance=true --sbom=true"

# Target platforms
PLATFORMS="--platform linux/amd64,linux/arm64"

# If this is a release, get version information
# Release is specified with a "--release" argument
IS_RELEASE=false
for arg in "$@"; do
  if [[ "$arg" == "--release" ]]; then
    IS_RELEASE=true
    FULL_VERSION=$(node -p "require('./package.json').version")
    MAJOR_DOT_MINOR=$(node -p "require('./package.json').version.split('.').slice(0, 2).join('.')")
    break
  fi
done

# Build and push server Docker images
SERVER_TAGS="--tag $SERVER_DOCKERHUB_REPOSITORY:latest --tag $SERVER_DOCKERHUB_REPOSITORY:$GITHUB_SHA"
if [[ "$IS_RELEASE" == "true" ]]; then
  SERVER_TAGS="$SERVER_TAGS --tag $SERVER_DOCKERHUB_REPOSITORY:$FULL_VERSION --tag $SERVER_DOCKERHUB_REPOSITORY:$MAJOR_DOT_MINOR"
fi
docker buildx build $ATTESTATIONS $PLATFORMS $SERVER_TAGS --push .
