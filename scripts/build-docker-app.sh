#!/usr/bin/env bash

# Only build app if APP_DOCKERHUB_REPOSITORY was passed
if [[ -z "${APP_DOCKERHUB_REPOSITORY}" ]]; then
  echo "APP_DOCKERHUB_REPOSITORY env var not configured. Skipping..."
  # Don't fail if no APP_DOCKERHUB_REPOSITORY present
  exit 0
fi

if [[ -z "${GITHUB_SHA}" ]]; then
  echo "GITHUB_SHA is missing"
  exit 1
fi

# Fail on error
set -e

# Echo commands
set -x

# Build app tarball
# The -C flag rewrites the base path from packages/app/dist/ to ./
tar \
  --no-xattrs \
  -czf ./packages/app/medplum-app.tar.gz \
  -C packages/app/dist .

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

# This is so we can build the staging server Dockerfile without having to build app
# Build and push app Docker images
APP_TAGS="--tag $APP_DOCKERHUB_REPOSITORY:$GITHUB_SHA"
if [[ "$IS_LATEST" == "true" ]]; then
  APP_TAGS="$APP_TAGS --tag $APP_DOCKERHUB_REPOSITORY:latest"
fi
if [[ "$IS_RELEASE" == "true" ]]; then
  APP_TAGS="$APP_TAGS --tag $APP_DOCKERHUB_REPOSITORY:$FULL_VERSION --tag $APP_DOCKERHUB_REPOSITORY:$MAJOR_DOT_MINOR"
fi
# A release that is already published from the same inputs only gets its tags (re)applied
LABELS=""
if [[ "$IS_RELEASE" == "true" ]]; then
  source "$(dirname "${BASH_SOURCE[0]}")/docker-release-utils.sh"
  CONTENT_HASH=$(input_hash packages/app/Dockerfile packages/app/docker-entrypoint.sh packages/app/medplum-app.tar.gz)
  LABELS="--label $CONTENT_HASH_LABEL=$CONTENT_HASH --label org.opencontainers.image.revision=$GITHUB_SHA"
fi

if [[ "$IS_RELEASE" == "true" ]] && is_published "$APP_DOCKERHUB_REPOSITORY:$FULL_VERSION" "$CONTENT_HASH"; then
  docker buildx imagetools create $APP_TAGS "$APP_DOCKERHUB_REPOSITORY@$PUBLISHED_DIGEST"
else
  pushd packages/app
  docker buildx build $ATTESTATIONS $PLATFORMS $APP_TAGS $LABELS --push .
  popd
fi
