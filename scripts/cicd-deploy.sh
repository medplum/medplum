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

COMMIT_MESSAGE=$(git log -1 --pretty=short)
echo "$COMMIT_MESSAGE"

# When multiple commits land in a single push (e.g. merge queue batching),
# GITHUB_BEFORE is the SHA that HEAD pointed to before the push. Diffing
# HEAD..GITHUB_BEFORE covers every commit in the batch, not just the last one.
# Fall back to HEAD~1 when GITHUB_BEFORE is absent (workflow_dispatch)
# cat-file -e checks that we have the commit locally in order to diff successfully
if [[ -n "$GITHUB_BEFORE" ]] && git cat-file -e "$GITHUB_BEFORE" 2>/dev/null; then
  export TURBO_SCM_BASE=$GITHUB_BEFORE
else
  export TURBO_SCM_BASE=HEAD~1
fi

DEPLOYABLE_PACKAGES=("@medplum/app" "@medplum/server" "@medplum/graphiql" "@medplum/storybook" "@medplum/docs")

# Invoking this script with `--force` deploys the full deployable set
# regardless of the diff; otherwise we deploy only the affected packages.
if [[ "$FORCE" = true ]]; then
  PACKAGES_TO_DEPLOY=("${DEPLOYABLE_PACKAGES[@]}")
else
  # Determine which deployable packages have changed since $TURBO_SCM_BASE
  PACKAGES_CHANGED=$(npx turbo query affected --packages "${DEPLOYABLE_PACKAGES[@]}" \
    | jq -r '.data.affectedPackages.items[].name')

  PACKAGES_TO_DEPLOY=()
  while IFS= read -r pkg; do
    [[ -n "$pkg" ]] && PACKAGES_TO_DEPLOY+=("$pkg")
  done <<< "$PACKAGES_CHANGED"
fi

# Build the packages we are going to deploy
if [[ ${#PACKAGES_TO_DEPLOY[@]} -gt 0 ]]; then
  BUILD_FILTERS=()
  for pkg in "${PACKAGES_TO_DEPLOY[@]}"; do
    BUILD_FILTERS+=(--filter="$pkg")
  done

  # We use `--force` because the `build` task in `@medplum/core` has an implicit
  # build-time dependency on the git hash (used to bake it in to `MEDPLUM_VERSION`),
  # and we don't want to read an old version string from the turborepo build cache.
  npx turbo run build --force "${BUILD_FILTERS[@]}"
fi

# Set DEPLOY_* based on membership in the deploy set we just built. Each line of
# PACKAGES_TO_DEPLOY is a complete package name, so we compare it exactly.
package_will_deploy() {
  local target="$1"
  for pkg in "${PACKAGES_TO_DEPLOY[@]}"; do
    [[ "$pkg" == "$target" ]] && return 0
  done
  return 1
}

if package_will_deploy "@medplum/app";       then DEPLOY_APP=true;       else DEPLOY_APP=false;       fi
if package_will_deploy "@medplum/docs";      then DEPLOY_DOCS=true;      else DEPLOY_DOCS=false;      fi
if package_will_deploy "@medplum/graphiql";  then DEPLOY_GRAPHIQL=true;  else DEPLOY_GRAPHIQL=false;  fi
if package_will_deploy "@medplum/server";    then DEPLOY_SERVER=true;    else DEPLOY_SERVER=false;    fi
if package_will_deploy "@medplum/storybook"; then DEPLOY_STORYBOOK=true; else DEPLOY_STORYBOOK=false; fi

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
        "text": "Deploying ${ESCAPED_COMMIT_MESSAGE}\\n\\n* Deploy app: ${DEPLOY_APP}\\n\\n* Deploy docs: ${DEPLOY_DOCS}\\n\\n* Deploy graphiql: ${DEPLOY_GRAPHIQL}\\n\\n* Deploy server: ${DEPLOY_SERVER}\\n\\n* Deploy storybook: ${DEPLOY_STORYBOOK}"
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

  source ./scripts/build-docker-app.sh --latest
  source ./scripts/deploy-app.sh
fi

if [[ "$DEPLOY_SERVER" = true ]]; then
  echo "Deploy server"
  source ./scripts/build-docker-server.sh --latest
  source ./scripts/deploy-server.sh
fi

if [[ "$DEPLOY_GRAPHIQL" = true ]]; then
  echo "Deploy GraphiQL"
  source ./scripts/deploy-graphiql.sh
fi

if [[ "$DEPLOY_STORYBOOK" = true ]]; then
  echo "Deploy storybook"
  source ./scripts/deploy-storybook.sh
fi

# Deploy docs last since it is the slowest
if [[ "$DEPLOY_DOCS" = true ]]; then
  echo "Deploy docs"
  source ./scripts/deploy-docs.sh
fi
