#!/usr/bin/env bash

# Helpers for publishing release images safely across re-runs. Built images (and their
# provenance/SBOM attestations) are not byte-reproducible, so instead of comparing digests, each
# release image is labeled with a hash of its build inputs.

CONTENT_HASH_LABEL="org.medplum.content-hash"

# Prints a hash of the paths and contents of the given files. A .tar.gz contributes the files
# inside it rather than its own bytes, which embed mtimes that change on every build.
input_hash() {
  local work f
  work=$(mktemp -d)
  for f in "$@"; do
    if [[ "$f" == *.tar.gz ]]; then
      mkdir -p "$work/$f"
      tar -xzf "$f" -C "$work/$f"
    else
      mkdir -p "$work/$(dirname "$f")"
      cp "$f" "$work/$f"
    fi
  done
  (cd "$work" && find . -type f -print0 | LC_ALL=C sort -z | xargs -0 sha256sum) | sha256sum | cut -d' ' -f1
  rm -rf "$work"
}

# Succeeds if <image:tag> is already published from inputs with <hash>, setting PUBLISHED_DIGEST.
# Returns 1 if the tag does not exist. Exits if it exists with different or unknown inputs.
is_published() {
  local ref=$1 hash=$2 manifest err digest hashes
  err=$(mktemp)
  if ! manifest=$(docker buildx imagetools inspect "$ref" --format '{{json .Manifest}}' 2> "$err"); then
    if grep -q ': not found' "$err"; then
      rm -f "$err"
      return 1
    fi
    echo "::error::Failed to inspect $ref: $(cat "$err")"
    exit 1
  fi
  rm -f "$err"
  digest=$(jq -r '.digest' <<< "$manifest")

  # A multi-platform image has one config per platform, and each must carry the same hash
  hashes=$(docker buildx imagetools inspect "${ref%:*}@$digest" --format '{{json .Image}}' |
    jq -r --arg label "$CONTENT_HASH_LABEL" \
      '(if has("config") then [.] else [.[]] end) | map(.config.Labels[$label] // "") | unique | join(" ")')
  if [[ -z "$hashes" ]]; then
    echo "::error::$ref is already published without a $CONTENT_HASH_LABEL label, so it cannot be verified against this build"
    exit 1
  elif [[ "$hashes" != "$hash" ]]; then
    echo "::error::$ref is already published with content hash '${hashes}', but the local build has '${hash}'"
    exit 1
  fi
  PUBLISHED_DIGEST=$digest
}
