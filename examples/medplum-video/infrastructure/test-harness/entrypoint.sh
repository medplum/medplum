#!/bin/sh
#
# Render /usr/share/nginx/html/config.js from the container's env vars so
# the same Docker image can be deployed to any environment.
#
# Copied into /docker-entrypoint.d/ by the Dockerfile – nginx runs every
# executable script in that directory before starting the daemon.
#
# Expected env vars (all optional – missing values fall through to the
# dev fallback baked in by Vite at build time):
#
#   MEDPLUM_BASE_URL              https://api.staging.medplum.dev/
#   MEDPLUM_CLIENT_ID             <UUID>
#   MEDPLUM_CLIENT_SECRET         <secret>
#   GENERATE_TOKEN_BOT_ID         <UUID>
#   ADMIT_PATIENT_BOT_ID          <UUID>
#   START_ADHOC_VISIT_BOT_ID      <UUID>
#   DEFAULT_PATIENT_ID            optional seed for the UI dropdown
#   DEFAULT_PRACTITIONER_ID       optional seed for the UI dropdown
#   ENVIRONMENT_LABEL             "dev" | "staging" | "prod" – shown in header

set -eu

CONFIG_FILE="/usr/share/nginx/html/config.js"

# Escape backslashes and double quotes so the value is a safe JS string literal.
js_escape() {
  printf '%s' "$1" | sed -e 's/\\/\\\\/g' -e 's/"/\\"/g'
}

emit() {
  key="$1"
  value="$2"
  if [ -n "$value" ]; then
    printf '  "%s": "%s",\n' "$key" "$(js_escape "$value")"
  fi
}

{
  echo '// Generated at container startup by entrypoint.sh – do not edit.'
  echo 'window.__MEDPLUM_VIDEO_CONFIG__ = {'
  emit medplumBaseUrl        "${MEDPLUM_BASE_URL:-}"
  emit medplumClientId       "${MEDPLUM_CLIENT_ID:-}"
  emit medplumClientSecret   "${MEDPLUM_CLIENT_SECRET:-}"
  emit generateTokenBotId    "${GENERATE_TOKEN_BOT_ID:-}"
  emit admitPatientBotId     "${ADMIT_PATIENT_BOT_ID:-}"
  emit startAdHocVisitBotId  "${START_ADHOC_VISIT_BOT_ID:-}"
  emit defaultPatientId      "${DEFAULT_PATIENT_ID:-}"
  emit defaultPractitionerId "${DEFAULT_PRACTITIONER_ID:-}"
  emit environmentLabel      "${ENVIRONMENT_LABEL:-}"
  echo '};'
} > "$CONFIG_FILE"

echo "[entrypoint] wrote $CONFIG_FILE (env=${ENVIRONMENT_LABEL:-unset}, base=${MEDPLUM_BASE_URL:-unset})"
