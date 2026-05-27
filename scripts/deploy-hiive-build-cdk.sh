#!/usr/bin/env bash

set -euo pipefail

export AWS_PAGER=""

action="${1:-diff}"
config_file="${CDK_CONFIG_FILE:-medplum.build.config.json}"

build_workspace() {
  local workspace="$1"

  echo "::group::Build ${workspace}"
  if npm --workspace "$workspace" run build; then
    echo "::endgroup::"
    return 0
  fi

  local exit_code=$?
  echo "::endgroup::"
  return "$exit_code"
}

build_local_cdk() {
  build_workspace @medplum/definitions || return $?
  build_workspace @medplum/fhirtypes || return $?
  build_workspace @medplum/core || return $?
  build_workspace @medplum/cdk || return $?
}

case "$action" in
  synth)
    build_local_cdk
    npx cdk synth -c config="$config_file" > /dev/null
    ;;
  diff)
    build_local_cdk
    npx cdk diff -c config="$config_file" --no-change-set
    ;;
  deploy)
    build_local_cdk
    npx cdk deploy -c config="$config_file" --require-approval never
    ;;
  describe)
    node packages/cli/dist/cjs/index.cjs aws describe build
    ;;
  *)
    echo "Usage: bash ./scripts/deploy-hiive-build-cdk.sh [synth|diff|deploy|describe]" >&2
    exit 1
    ;;
esac