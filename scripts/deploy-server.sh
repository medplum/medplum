#!/usr/bin/env bash

if [[ -z "${DOCKER_SERVER}" ]]; then
  echo "DOCKER_SERVER is missing"
  exit 1
fi

if [[ -z "${DOCKER_REPOSITORY}" ]]; then
  echo "DOCKER_REPOSITORY is missing"
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
  packages/fhirpath/package.json \
  packages/fhirpath/dist \
  packages/server/package.json \
  packages/server/dist \
  packages/server/templates

# Build the Docker image
docker build . -t $DOCKER_REPOSITORY:latest -t $DOCKER_REPOSITORY:$GITHUB_SHA

# Push the Docker image
docker push $DOCKER_REPOSITORY:latest
docker push $DOCKER_REPOSITORY:$GITHUB_SHA

# Update the medplum fargate service
aws ecs update-service \
  --region $AWS_REGION \
  --cluster $ECS_CLUSTER \
  --service $ECS_SERVICE \
  --force-new-deployment
