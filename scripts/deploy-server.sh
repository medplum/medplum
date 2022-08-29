#!/usr/bin/env bash

if [[ -z "${DOCKERHUB_REPOSITORY}" ]]; then
  echo "DOCKERHUB_REPOSITORY is missing"
  exit 1
fi

if [[ -z "${ECR_REPOSITORY}" ]]; then
  echo "ECR_REPOSITORY is missing"
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

# Build server tarball
tar \
  --exclude='*.js.map' \
  --exclude='*.ts' \
  --exclude='*.tsbuildinfo' \
  -czf medplum-server.tar.gz \
  package.json \
  package-lock.json \
  packages/core/package.json \
  packages/core/dist \
  packages/definitions/package.json \
  packages/definitions/dist \
  packages/server/package.json \
  packages/server/dist

# Build the Docker image
# Tag for both Docker Hub and AWS Elastic Container Registry (ECR)
docker build . \
  -t "$DOCKERHUB_REPOSITORY:latest" \
  -t "$DOCKERHUB_REPOSITORY:$GITHUB_SHA" \
  -t "$ECR_REPOSITORY:latest" \
  -t "$ECR_REPOSITORY:$GITHUB_SHA"

# Push the Docker image
docker push "$DOCKERHUB_REPOSITORY:latest"
docker push "$DOCKERHUB_REPOSITORY:$GITHUB_SHA"
docker push "$ECR_REPOSITORY:latest"
docker push "$ECR_REPOSITORY:$GITHUB_SHA"

# Update the medplum fargate service
aws ecs update-service \
  --region "$AWS_REGION" \
  --cluster "$ECS_CLUSTER" \
  --service "$ECS_SERVICE" \
  --force-new-deployment
