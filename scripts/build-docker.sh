#!/usr/bin/env bash

if [[ -z "${DOCKERHUB_REPOSITORY}" ]]; then
  echo "DOCKERHUB_REPOSITORY is missing"
  exit 1
fi

# Fail on error
set -e

# Echo commands
set -x

# Build server tarball
tar \
  --exclude='*.ts' \
  --exclude='*.tsbuildinfo' \
  -czf medplum-server.tar.gz \
  package.json \
  package-lock.json \
  packages/core/package.json \
  packages/core/dist \
  packages/definitions/package.json \
  packages/definitions/dist \
  packages/fhir-router/package.json \
  packages/fhir-router/dist \
  packages/server/package.json \
  packages/server/dist

# Target platforms
PLATFORMS="--platform linux/amd64,linux/arm64,linux/arm/v7"

# Build tags
TAGS="--tag $DOCKERHUB_REPOSITORY:latest --tag $DOCKERHUB_REPOSITORY:$GITHUB_SHA"

# If this is a release, tag with version
# Release is specified with a "--release" argument
for arg in "$@"; do
  if [[ "$arg" == "--release" ]]; then
    VERSION=$(node -p "require('./package.json').version")
    TAGS="$TAGS --tag $DOCKERHUB_REPOSITORY:$VERSION"
    break
  fi
done

# Build and push Docker images
docker buildx build $PLATFORMS $TAGS --push .
