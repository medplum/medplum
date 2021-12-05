#!/usr/bin/env bash

# CI/CD deploy script
# This script should only be called from the CI/CD server.
# Assumes that current working directory is project root.
# Inspects files changed in the most recent commit
# and deploys the appropriate service

FILES_CHANGED=$(git diff --name-only HEAD HEAD~1)
echo "$FILES_CHANGED"

DEPLOY_APP=false
DEPLOY_DOCS=false
DEPLOY_GRAPHIQL=false
DEPLOY_SERVER=false
DEPLOY_STORYBOOK=false

#
# Inspect files changed
#

if [[ "$FILES_CHANGED" =~ ^Dockerfile ]]; then
  DEPLOY_SERVER=true
fi

if [[ "$FILES_CHANGED" =~ ^package-lock.json ]]; then
  DEPLOY_APP=true
  DEPLOY_DOCS=true
  DEPLOY_GRAPHIQL=true
  DEPLOY_SERVER=true
  DEPLOY_STORYBOOK=true
fi

if [[ "$FILES_CHANGED" =~ ^packages/app ]]; then
  DEPLOY_APP=true
fi

if [[ "$FILES_CHANGED" =~ ^packages/core ]]; then
  DEPLOY_APP=true
  DEPLOY_DOCS=true
  DEPLOY_GRAPHIQL=true
  DEPLOY_SERVER=true
  DEPLOY_STORYBOOK=true
fi

if [[ "$FILES_CHANGED" =~ ^packages/definitions ]]; then
  DEPLOY_APP=true
  DEPLOY_GRAPHIQL=true
  DEPLOY_SERVER=true
  DEPLOY_STORYBOOK=true
fi

if [[ "$FILES_CHANGED" =~ ^packages/docs ]]; then
  DEPLOY_DOCS=true
fi

if [[ "$FILES_CHANGED" =~ ^packages/graphiql ]]; then
  DEPLOY_GRAPHIQL=true
fi

if [[ "$FILES_CHANGED" =~ ^packages/server ]]; then
  DEPLOY_SERVER=true
fi

if [[ "$FILES_CHANGED" =~ ^packages/ui ]]; then
  DEPLOY_APP=true
  DEPLOY_STORYBOOK=true
fi

#
# Run the appropriate deploy scripts
#

if [[ "$DEPLOY_APP" = true ]]; then
  echo "Deploy app"
  source ./scripts/deploy-app.sh
fi

if [[ "$DEPLOY_DOCS" = true ]]; then
  echo "Deploy docs"
  source ./scripts/deploy-docs.sh
fi

if [[ "$DEPLOY_GRAPHIQL" = true ]]; then
  echo "Deploy GraphiQL"
  source ./scripts/deploy-graphiql.sh
fi

if [[ "$DEPLOY_SERVER" = true ]]; then
  echo "Deploy server"
  source ./scripts/deploy-server.sh
fi

if [[ "$DEPLOY_STORYBOOK" = true ]]; then
  echo "Deploy Storybook"
  source ./scripts/deploy-storybook.sh
fi
