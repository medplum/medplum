#!/usr/bin/env bash

set -euo pipefail

export AWS_PAGER=""

action="${1:-diff}"
config_file="${CDK_CONFIG_FILE:-medplum.build.config.json}"

build_local_cdk() {
  npm --workspace @medplum/core run build >/dev/null
  npm --workspace @medplum/cdk run build >/dev/null
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