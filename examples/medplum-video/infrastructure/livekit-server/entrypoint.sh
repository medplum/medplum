#!/bin/sh
# Startup wrapper for LiveKit server on AWS ECS Fargate.
#
# ECS injects two secrets from SSM Parameter Store as environment variables:
#   LIVEKIT_CONFIG_YAML  – plain YAML config (non-sensitive)
#   LIVEKIT_KEYS         – "api-key:api-secret" (SecureString)
#
# The script writes the config to a temp file and launches livekit-server.
set -eu

CONFIG_FILE="/tmp/livekit.yaml"

if [ -z "${LIVEKIT_CONFIG_YAML:-}" ]; then
  echo "ERROR: LIVEKIT_CONFIG_YAML is not set. Check ECS task secrets." >&2
  exit 1
fi

if [ -z "${LIVEKIT_KEYS:-}" ]; then
  echo "ERROR: LIVEKIT_KEYS is not set. Check ECS task secrets." >&2
  exit 1
fi

printf '%s\n' "${LIVEKIT_CONFIG_YAML}" > "${CONFIG_FILE}"

# LiveKit --keys flag requires "key: secret" format (space after colon).
# Normalise regardless of how the value was stored in SSM.
LIVEKIT_KEYS_FMT=$(printf '%s' "${LIVEKIT_KEYS}" | sed 's/:\([^ ]\)/: \1/')

exec /usr/local/bin/livekit-server \
  --config "${CONFIG_FILE}" \
  --keys "${LIVEKIT_KEYS_FMT}"
