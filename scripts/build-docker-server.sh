#!/usr/bin/env bash

# `SERVER_DOCKERHUB_REPOSITORY` should be set to the DockerHub repository name
# Example: medplum/medplum-server

if [[ -z "${SERVER_DOCKERHUB_REPOSITORY}" ]]; then
  echo "SERVER_DOCKERHUB_REPOSITORY is missing"
  exit 1
fi

GITHUB_SHA="${GITHUB_SHA:-$(git rev-parse HEAD)}"
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

# A release that is already published from the same inputs only gets its tags (re)applied
LABELS=""
if [[ "$IS_RELEASE" == "true" ]]; then
  source "$(dirname "${BASH_SOURCE[0]}")/docker-release-utils.sh"
  CONTENT_HASH=$(input_hash Dockerfile medplum-server-metadata.tar.gz medplum-server-runtime.tar.gz)
  LABELS="--label $CONTENT_HASH_LABEL=$CONTENT_HASH --label org.opencontainers.image.revision=$GITHUB_SHA"
fi

if [[ "$IS_RELEASE" == "true" ]] && is_published "$SERVER_DOCKERHUB_REPOSITORY:$FULL_VERSION" "$CONTENT_HASH"; then
  docker buildx imagetools create $SERVER_TAGS "$SERVER_DOCKERHUB_REPOSITORY@$PUBLISHED_DIGEST"
  SERVER_DOCKER_IMAGE_DIGEST=$PUBLISHED_DIGEST
else
  METADATA_FILE=$(mktemp)
  docker buildx build $ATTESTATIONS $PLATFORMS $SERVER_TAGS $LABELS --progress=plain --push --metadata-file "$METADATA_FILE" .

  SERVER_DOCKER_IMAGE_DIGEST=$(jq -r '."containerimage.digest"' "$METADATA_FILE")
  rm -f "$METADATA_FILE"
fi

if [[ -z "${SERVER_DOCKER_IMAGE_DIGEST}" || "${SERVER_DOCKER_IMAGE_DIGEST}" == "null" ]]; then
  echo "Failed to determine pushed Docker image digest"
  exit 1
fi

export SERVER_DOCKER_IMAGE_DIGEST
export SERVER_DOCKER_IMAGE="${SERVER_DOCKERHUB_REPOSITORY}@${SERVER_DOCKER_IMAGE_DIGEST}"

# Persist values for subsequent GitHub Actions steps in the same job.
if [[ -n "${GITHUB_ENV}" ]]; then
  echo "SERVER_DOCKER_IMAGE_DIGEST=${SERVER_DOCKER_IMAGE_DIGEST}" >> "${GITHUB_ENV}"
  echo "SERVER_DOCKER_IMAGE=${SERVER_DOCKER_IMAGE}" >> "${GITHUB_ENV}"
fi
