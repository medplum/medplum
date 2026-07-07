#!/usr/bin/env bash

if [[ -z "${ECS_CLUSTER}" ]]; then
  echo "ECS_CLUSTER is missing"
  exit 1
fi

if [[ -z "${ECS_SERVICE}" ]]; then
  echo "ECS_SERVICE is missing"
  exit 1
fi

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

# The immutable image we want the service to run
IMAGE="${SERVER_DOCKERHUB_REPOSITORY}:${GITHUB_SHA}"

# Pin an ECS service to $IMAGE by registering a new task definition revision
# based on the currently-deployed one. This replaces `--force-new-deployment`
# against a mutable `:latest` tag with a deploy of a specific git SHA.
deploy_service() {
  local cluster="$1"
  local service="$2"

  # Task definition ARN the service is currently running
  local current_arn
  current_arn=$(aws ecs describe-services \
    --cluster "$cluster" \
    --services "$service" \
    --query 'services[0].taskDefinition' \
    --output text)

  # Fetch that task definition, swap the image tag on any container using our
  # repository, and strip the read-only fields that register-task-definition
  # rejects. Matching by repository (not container name) covers both the
  # server container and the background-jobs worker container, which run the
  # same image under different names.
  local new_task_def
  new_task_def=$(aws ecs describe-task-definition \
    --task-definition "$current_arn" \
    --query 'taskDefinition' \
    --output json \
    | jq --arg repo "$SERVER_DOCKERHUB_REPOSITORY" --arg image "$IMAGE" '
        .containerDefinitions |= map(
          if (.image | startswith($repo + ":")) then .image = $image else . end
        )
        | del(
            .taskDefinitionArn,
            .revision,
            .status,
            .requiresAttributes,
            .compatibilities,
            .registeredAt,
            .registeredBy
          )
      ')

  # Register the new revision
  local new_arn
  new_arn=$(aws ecs register-task-definition \
    --cli-input-json "$new_task_def" \
    --query 'taskDefinition.taskDefinitionArn' \
    --output text)

  # Point the service at the new revision
  aws ecs update-service \
    --cluster "$cluster" \
    --service "$service" \
    --task-definition "$new_arn"
}

# Update the medplum fargate service
deploy_service "$ECS_CLUSTER" "$ECS_SERVICE"

# Optionally update a worker service if both env vars are set
if [[ -n "${WORKER_ECS_CLUSTER}" && -n "${WORKER_ECS_SERVICE}" ]]; then
  echo "Deploying worker service $WORKER_ECS_SERVICE in $WORKER_ECS_CLUSTER"
  deploy_service "$WORKER_ECS_CLUSTER" "$WORKER_ECS_SERVICE"
fi
