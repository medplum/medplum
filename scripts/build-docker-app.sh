#!/usr/bin/env bash

if [[ -z "${GITHUB_SHA}" ]]; then
  echo "GITHUB_SHA is missing"
  exit 1
fi

# Only build app if APP_DOCKERHUB_REPOSITORY was passed
if [[ -z "${APP_DOCKERHUB_REPOSITORY}" ]]; then
  echo "APP_DOCKERHUB_REPOSITORY is missing"
  exit 1
fi

# Fail on error
set -e

# Echo commands
set -x

# We create a subshell for the build since we need to set the env vars to our placeholders for the Docker build
# We will replace the placeholders later with our actual env vars in deploy-app.sh
(
  export MEDPLUM_BASE_URL="__MEDPLUM_BASE_URL__"
  export MEDPLUM_CLIENT_ID="__MEDPLUM_CLIENT_ID__"
  export MEDPLUM_REGISTER_ENABLED="__MEDPLUM_REGISTER_ENABLED__"
  export MEDPLUM_AWS_TEXTRACT_ENABLED="__MEDPLUM_AWS_TEXTRACT_ENABLED__"
  export GOOGLE_CLIENT_ID="__GOOGLE_CLIENT_ID__"
  export RECAPTCHA_SITE_KEY="__RECAPTCHA_SITE_KEY__"
  npm run build -- --force --filter=@medplum/app
)

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
for arg in "$@"; do
  if [[ "$arg" == "--release" ]]; then
    IS_RELEASE=true
    FULL_VERSION=$(node -p "require('./package.json').version")
    MAJOR_DOT_MINOR=$(node -p "require('./package.json').version.split('.').slice(0, 2).join('.')")
    break
  fi
done

# This is so we can build the staging server Dockerfile without having to build app
# Build and push app Docker images
APP_TAGS="--tag $APP_DOCKERHUB_REPOSITORY:latest --tag $APP_DOCKERHUB_REPOSITORY:$GITHUB_SHA"
if [[ "$IS_RELEASE" == "true" ]]; then
  APP_TAGS="$APP_TAGS --tag $APP_DOCKERHUB_REPOSITORY:$FULL_VERSION --tag $APP_DOCKERHUB_REPOSITORY:$MAJOR_DOT_MINOR"
fi
pushd packages/app
docker buildx build $ATTESTATIONS $PLATFORMS $APP_TAGS --push .
popd
