#!/usr/bin/env bash

# `ALL_IN_ONE_DOCKERHUB_REPOSITORY` should be set to the Docker Hub repository name.
# Example: medplum/medplum-all-in-one

if [[ -z "${ALL_IN_ONE_DOCKERHUB_REPOSITORY}" ]]; then
  echo "ALL_IN_ONE_DOCKERHUB_REPOSITORY is missing"
  exit 1
fi

GITHUB_SHA="${GITHUB_SHA:-$(git rev-parse HEAD)}"
if [[ -z "${GITHUB_SHA}" ]]; then
  echo "GITHUB_SHA is missing"
  exit 1
fi

set -e
set -x

BUILD_DIR="docker/all-in-one"

# Build server "metadata" tarball.
tar \
  --no-xattrs \
  -czf "${BUILD_DIR}/medplum-server-metadata.tar.gz" \
  package.json \
  package-lock.json \
  packages/bot-layer/package.json \
  packages/ccda/package.json \
  packages/core/package.json \
  packages/definitions/package.json \
  packages/fhir-router/package.json \
  packages/server/package.json

# Build server "runtime" tarball.
tar \
  --no-xattrs \
  --exclude='*.ts' \
  --exclude='*.tsbuildinfo' \
  -czf "${BUILD_DIR}/medplum-server-runtime.tar.gz" \
  LICENSE.txt \
  NOTICE \
  packages/ccda/dist \
  packages/core/dist \
  packages/definitions/dist \
  packages/fhir-router/dist \
  packages/server/dist

# Build app tarball.
tar \
  --no-xattrs \
  -czf "${BUILD_DIR}/medplum-app.tar.gz" \
  -C packages/app/dist .

# Supply chain attestations.
ATTESTATIONS="--provenance=true --sbom=true"

# Target platforms.
PLATFORMS="--platform linux/amd64,linux/arm64"

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
  fi
done

ALL_IN_ONE_TAGS="--tag $ALL_IN_ONE_DOCKERHUB_REPOSITORY:$GITHUB_SHA"

if [[ "$IS_LATEST" == "true" ]]; then
  ALL_IN_ONE_TAGS="$ALL_IN_ONE_TAGS --tag $ALL_IN_ONE_DOCKERHUB_REPOSITORY:latest"
fi

if [[ "$IS_RELEASE" == "true" ]]; then
  ALL_IN_ONE_TAGS="$ALL_IN_ONE_TAGS --tag $ALL_IN_ONE_DOCKERHUB_REPOSITORY:$FULL_VERSION --tag $ALL_IN_ONE_DOCKERHUB_REPOSITORY:$MAJOR_DOT_MINOR"
fi

docker buildx build \
  $ATTESTATIONS \
  $PLATFORMS \
  $ALL_IN_ONE_TAGS \
  --progress=plain \
  --push \
  -f docker/all-in-one/Dockerfile \
  .
