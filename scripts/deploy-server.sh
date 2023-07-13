#!/usr/bin/env bash

if [[ -z "${DOCKERHUB_REPOSITORY}" ]]; then
  echo "DOCKERHUB_REPOSITORY is missing"
  exit 1
fi

if [[ -z "${ECS_CLUSTER}" ]]; then
  echo "ECS_CLUSTER is missing"
  exit 1
fi

if [[ -z "${ECS_SERVICE}" ]]; then
  echo "ECS_SERVICE is missing"
  exit 1
fi

# Fail on error
set -e

# Echo commands
set -x

# Get version
VERSION=$(node -p "require('./package.json').version")

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

# Build and push Docker images
docker buildx build \
  --platform linux/amd64,linux/arm64,linux/arm/v7 \
  --tag "$DOCKERHUB_REPOSITORY:latest" \
  --tag "$DOCKERHUB_REPOSITORY:$VERSION" \
  --tag "$DOCKERHUB_REPOSITORY:$GITHUB_SHA" \
  --push \
  .

# Update the medplum fargate service
aws ecs update-service \
  --region "$AWS_REGION" \
  --cluster "$ECS_CLUSTER" \
  --service "$ECS_SERVICE" \
  --force-new-deployment
