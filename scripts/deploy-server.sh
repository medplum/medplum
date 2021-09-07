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

# Login to AWS ECR
aws ecr get-login-password --profile medplum --region us-east-1 | docker login --username AWS --password-stdin $DOCKER_SERVER

# Build the Docker image
docker build . -t $DOCKER_REPOSITORY:latest -t $DOCKER_REPOSITORY:0.1.6

# Push the Docker image
docker push $DOCKER_REPOSITORY:0.1.6
docker push $DOCKER_REPOSITORY:latest

# Update the medplum fargate service
aws ecs update-service \
  --profile medplum \
  --region us-east-1 \
  --cluster $ECS_CLUSTER \
  --service $ECS_SERVICE \
  --force-new-deployment
