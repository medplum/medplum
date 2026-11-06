#!/usr/bin/env bash

# Publishes each package, safe to re-run: a version that is already on the registry is skipped
# when its tarball integrity matches the local build, and fails the script when it doesn't.

set -xe

PACKAGES=(
  "agent"
  "app"
  "bot-layer"
  "ccda"
  "cdk"
  "cli"
  "cli-wrapper"
  "core"
  "create-medplum"
  "definitions"
  "dosespot-core"
  "dosespot-react"
  "eslint-config"
  "fhir-router"
  "fhirtypes"
  "health-gorilla-core"
  "health-gorilla-react"
  "hl7"
  "mock"
  "react"
  "react-hooks"
  "react-scheduling"
  "scriptsure-react"
)

PACK_DIR=$(mktemp -d)

# Prints the registry's integrity for a name@version, or nothing if that version is not published
remote_integrity() {
  local out
  if out=$(npm view --prefer-online --json "$1" dist.integrity 2>/dev/null); then
    jq -r '.' <<< "$out"
  elif [ "$(jq -r '.error.code // empty' <<< "$out" 2>/dev/null)" != "E404" ]; then
    echo "::error::Failed to look up $1 on the registry: $out" >&2
    return 1
  fi
}

# Reports which files differ between the published and local tarballs, then exits
fail_mismatch() {
  local spec=$1 local_tgz=$2 published=$3 built=$4
  echo "::error::$spec is already published with integrity $published, but the local build has $built"
  local diff_dir
  diff_dir=$(mktemp -d)
  mkdir "$diff_dir/remote" "$diff_dir/local"
  npm pack --pack-destination "$diff_dir" "$spec"
  tar -xzf "$diff_dir"/*.tgz -C "$diff_dir/remote"
  tar -xzf "$local_tgz" -C "$diff_dir/local"
  diff -rq "$diff_dir/remote" "$diff_dir/local" || true
  exit 1
}

for package in "${PACKAGES[@]}"; do
  echo "Publish $package"
  pushd "packages/$package"
  cp ../../LICENSE.txt .
  cp ../../NOTICE .

  NAME=$(node -p "require('./package.json').name")
  VERSION=$(node -p "require('./package.json').version")

  # Publish the exact tarball that was hashed
  PACK_JSON=$(npm pack --json --pack-destination "$PACK_DIR")
  TGZ="$PACK_DIR/$(jq -r '.[0].filename' <<< "$PACK_JSON")"
  LOCAL=$(jq -r '.[0].integrity' <<< "$PACK_JSON")
  REMOTE=$(remote_integrity "$NAME@$VERSION")

  if [ "$REMOTE" = "$LOCAL" ]; then
    echo "$NAME@$VERSION already published with matching integrity; skipping"
  elif [ -n "$REMOTE" ]; then
    fail_mismatch "$NAME@$VERSION" "$TGZ" "$REMOTE" "$LOCAL"
  else
    for attempt in 1 2 3; do
      npm publish "$TGZ" --provenance --access public && break

      REMOTE=$(remote_integrity "$NAME@$VERSION")
      if [ "$REMOTE" = "$LOCAL" ]; then
        echo "$NAME@$VERSION is published despite the error; continuing"
        break
      elif [ -n "$REMOTE" ]; then
        fail_mismatch "$NAME@$VERSION" "$TGZ" "$REMOTE" "$LOCAL"
      fi

      if [ "$attempt" = 3 ]; then
        exit 1
      fi

      sleep $((attempt * 5))
    done
  fi

  popd
done
