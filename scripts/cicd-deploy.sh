#!/usr/bin/env bash

# CI/CD deploy script
# This script should only be called from the CI/CD server.
# Assumes that current working directory is project root.
# Inspects files changed in the most recent commit
# and deploys the appropriate service

# Echo commands
set -x

# Initialize FORCE flag to false
FORCE=false

# Parse command line arguments
for arg in "$@"; do
  if [[ "$arg" == "--force" ]]; then
    FORCE=true
  fi
done

COMMIT_MESSAGE=$(git log -1 --pretty=%B)
echo "$COMMIT_MESSAGE"

FILES_CHANGED=$(git diff --name-only HEAD HEAD~1)
echo "$FILES_CHANGED"

DEPLOY_APP=false
DEPLOY_DOCS=false
DEPLOY_GRAPHIQL=false
DEPLOY_SERVER=false

#
# Inspect files changed
#

if [[ "$FILES_CHANGED" =~ build.yml ]]; then
  DEPLOY_SERVER=true
fi

if [[ "$FILES_CHANGED" =~ Dockerfile ]]; then
  DEPLOY_SERVER=true
fi

if [[ "$FILES_CHANGED" =~ cicd-deploy.sh ]]; then
  DEPLOY_APP=true
  DEPLOY_DOCS=true
  DEPLOY_GRAPHIQL=true
  DEPLOY_SERVER=true
fi

if [[ "$FILES_CHANGED" =~ deploy-introspection-schema.sh ]]; then
  DEPLOY_GRAPHIQL=true
fi

if [[ "$FILES_CHANGED" =~ packages/app ]]; then
  DEPLOY_APP=true
fi

if [[ "$FILES_CHANGED" =~ packages/ccda ]]; then
  DEPLOY_SERVER=true
fi

if [[ "$FILES_CHANGED" =~ packages/core ]]; then
  DEPLOY_APP=true
  DEPLOY_DOCS=true
  DEPLOY_SERVER=true
fi

if [[ "$FILES_CHANGED" =~ packages/definitions ]]; then
  DEPLOY_APP=true
  DEPLOY_SERVER=true
fi

if [[ "$FILES_CHANGED" =~ packages/docs ]]; then
  DEPLOY_DOCS=true
fi

if [[ "$FILES_CHANGED" =~ packages/fhir-router ]]; then
  DEPLOY_SERVER=true
fi

if [[ "$FILES_CHANGED" =~ packages/fhirtypes ]]; then
  DEPLOY_APP=true
  DEPLOY_SERVER=true
fi

if [[ "$FILES_CHANGED" =~ packages/graphiql ]]; then
  DEPLOY_GRAPHIQL=true
fi

if [[ "$FILES_CHANGED" =~ packages/server ]]; then
  DEPLOY_SERVER=true
fi

if [[ "$FILES_CHANGED" =~ packages/react ]]; then
  DEPLOY_APP=true
fi

if [[ "$FORCE" = true ]]; then
  DEPLOY_APP=true
  DEPLOY_DOCS=true
  DEPLOY_GRAPHIQL=true
  DEPLOY_SERVER=true
fi

#
# Send a slack message
#

ESCAPED_COMMIT_MESSAGE=$(echo "$COMMIT_MESSAGE" | sed 's/"/\\"/g')

read -r -d '' PAYLOAD <<- EOM
{
  "text": "Deploying ${ESCAPED_COMMIT_MESSAGE}",
  "blocks": [
    {
      "type": "section",
      "text": {
        "type": "mrkdwn",
        "text": "Deploying ${ESCAPED_COMMIT_MESSAGE}\\n\\n* Deploy app: ${DEPLOY_APP}\\n\\n* Deploy docs: ${DEPLOY_DOCS}\\n\\n* Deploy graphiql: ${DEPLOY_GRAPHIQL}\\n\\n* Deploy server: ${DEPLOY_SERVER}"
      }
    }
  ]
}
EOM

curl -X POST -H 'Content-type: application/json' --data "$PAYLOAD" "$SLACK_WEBHOOK_URL"

#
# Run the appropriate deploy scripts
#

if [[ "$DEPLOY_APP" = true ]]; then
  echo "Deploy app"
  source ./scripts/build-docker-app.sh
  source ./scripts/deploy-app.sh
fi

if [[ "$DEPLOY_GRAPHIQL" = true ]]; then
  echo "Deploy GraphiQL"
  source ./scripts/deploy-graphiql.sh
fi

if [[ "$DEPLOY_SERVER" = true ]]; then
  echo "Deploy server"
  source ./scripts/build-docker-server.sh
  source ./scripts/deploy-server.sh
fi

# Deploy docs last since it is the slowest
if [[ "$DEPLOY_DOCS" = true ]]; then
  echo "Deploy docs"
  source ./scripts/deploy-docs.sh
fi
