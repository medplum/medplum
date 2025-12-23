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

# Build server "metadata" tarball
tar \
  --no-xattrs \
  -czf medplum-server-metadata.tar.gz \
  package.json \
  package-lock.json \
  packages/bot-layer/package.json \
  packages/ccda/package.json \
  packages/core/package.json \
  packages/definitions/package.json \
  packages/fhir-router/package.json \
  packages/server/package.json

# Build server "runtime" tarball
tar \
  --no-xattrs \
  --exclude='*.ts' \
  --exclude='*.tsbuildinfo' \
  -czf medplum-server-runtime.tar.gz \
  LICENSE.txt \
  NOTICE \
  packages/ccda/dist \
  packages/core/dist \
  packages/definitions/dist \
  packages/fhir-router/dist \
  packages/server/dist

# Supply chain attestations
# See: https://docs.docker.com/scout/policy/#supply-chain-attestations
ATTESTATIONS="--provenance=true --sbom=true"

# Target platforms
PLATFORMS="--platform linux/amd64,linux/arm64"

# If this is a release, get version information
# Release is specified with a "--release" argument
IS_RELEASE=false
IS_LATEST=false
for arg in "$@"; do
  if [[ "$arg" == "--release" ]]; then
    IS_RELEASE=true
    FULL_VERSION=$(node -p "require('./package.json').version")
    MAJOR_DOT_MINOR=$(node -p "require('./package.json').version.split('.').slice(0, 2).join('.')")
    continue
  fi
  if [[ "$arg" == "--latest" ]]; then
    IS_LATEST=true
    continue
  fi
done

# Build and push server Docker images
SERVER_TAGS="--tag $SERVER_DOCKERHUB_REPOSITORY:$GITHUB_SHA"
if [[ "$IS_LATEST" == "true" ]]; then
  SERVER_TAGS="$SERVER_TAGS --tag $SERVER_DOCKERHUB_REPOSITORY:latest"
fi
if [[ "$IS_RELEASE" == "true" ]]; then
  SERVER_TAGS="$SERVER_TAGS --tag $SERVER_DOCKERHUB_REPOSITORY:$FULL_VERSION --tag $SERVER_DOCKERHUB_REPOSITORY:$MAJOR_DOT_MINOR"
fi
docker buildx build $ATTESTATIONS $PLATFORMS $SERVER_TAGS --push .
