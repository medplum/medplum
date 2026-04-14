#!/usr/bin/env bash
# SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
# SPDX-License-Identifier: Apache-2.0
#
# Manual smoke test for Project.defaultAccessPolicy + open registration defaults.
#
# Prerequisites: curl, jq
#
# Environment (Super Admin or other client that can PATCH Project + POST AccessPolicy):
#   MEDPLUM_BASE_URL   — default http://localhost:8103
#   MEDPLUM_CLIENT_ID
#   MEDPLUM_CLIENT_SECRET
#   E2E_PROJECT_ID     — Project id (UUID) to configure (required for bootstrap unless state file supplies it)
#
# Optional state file (gitignored parent dirs except scripts — store outside repo if preferred):
#   DEFAULT_ACCESS_E2E_STATE  — default: <repo>/.cursor/tmp/default-access-e2e-credentials.json
#
# Usage:
#   ./.cursor/scripts/test-default-access-policies.sh              # bootstrap + PATCH project
#   ./.cursor/scripts/test-default-access-policies.sh --verify-only # GET project and print defaultAccessPolicy
#
set -euo pipefail

READ_ONLY=false
if [[ "${1:-}" == "--verify-only" ]]; then
  READ_ONLY=true
fi

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "${SCRIPT_DIR}/../.." && pwd)"
: "${MEDPLUM_BASE_URL:=http://localhost:8103}"
BASE="${MEDPLUM_BASE_URL%/}"
FHIR="${BASE}/fhir/R4"
TOKEN_URL="${BASE}/oauth2/token"

STATE_FILE="${DEFAULT_ACCESS_E2E_STATE:-${REPO_ROOT}/.cursor/tmp/default-access-e2e-credentials.json}"

die() {
  echo "error: $*" >&2
  exit 1
}

command -v curl >/dev/null || die "curl is required"
command -v jq >/dev/null || die "jq is required"

if [[ "${READ_ONLY}" == true ]]; then
  [[ -f "${STATE_FILE}" ]] || die "missing state file ${STATE_FILE} (run without --verify-only first)"
  E2E_PROJECT_ID="$(jq -r '.projectId // empty' "${STATE_FILE}")"
  [[ -n "${E2E_PROJECT_ID}" ]] || die "state file missing projectId"
  TOKEN="$(jq -r '.accessToken // empty' "${STATE_FILE}")"
  if [[ -z "${TOKEN}" || "${TOKEN}" == "null" ]]; then
    [[ -n "${MEDPLUM_CLIENT_ID:-}" && -n "${MEDPLUM_CLIENT_SECRET:-}" ]] || die "set MEDPLUM_CLIENT_ID and MEDPLUM_CLIENT_SECRET or include accessToken in state file"
    TOKEN="$(fetch_token)"
  fi
else
  [[ -n "${MEDPLUM_CLIENT_ID:-}" && -n "${MEDPLUM_CLIENT_SECRET:-}" ]] || die "set MEDPLUM_CLIENT_ID and MEDPLUM_CLIENT_SECRET"
  [[ -n "${E2E_PROJECT_ID:-}" ]] || die "set E2E_PROJECT_ID to the tenant Project to update"
fi

fetch_token() {
  curl -sS -X POST "${TOKEN_URL}" \
    -H 'Content-Type: application/x-www-form-urlencoded' \
    --data-urlencode 'grant_type=client_credentials' \
    --data-urlencode "client_id=${MEDPLUM_CLIENT_ID}" \
    --data-urlencode "client_secret=${MEDPLUM_CLIENT_SECRET}" |
    jq -er '.access_token // empty' || die "oauth token response missing access_token (check client id/secret and MEDPLUM_BASE_URL)"
}

if [[ -z "${TOKEN:-}" ]]; then
  TOKEN="$(fetch_token)"
fi

auth_header() {
  echo "Authorization: Bearer ${TOKEN}"
}

get_project() {
  curl -sS -H "$(auth_header)" "${FHIR}/Project/${E2E_PROJECT_ID}" | jq .
}

if [[ "${READ_ONLY}" == true ]]; then
  echo "Verifying Project ${E2E_PROJECT_ID} at ${FHIR}..."
  get_project | jq '{id, defaultPatientAccessPolicy, defaultAccessPolicy}'
  exit 0
fi

echo "Creating AccessPolicy in ${FHIR}..."
AP_BODY="$(jq -nc --arg pid "${E2E_PROJECT_ID}" '{
  resourceType: "AccessPolicy",
  meta: { project: $pid },
  name: "E2E default patient access",
  resource: [{ resourceType: "Patient", criteria: "Patient?_id=%patient.id" }]
}')"

AP_RESPONSE="$(curl -sS -H "$(auth_header)" -H 'Content-Type: application/fhir+json' \
  -d "${AP_BODY}" "${FHIR}/AccessPolicy")"
AP_ID="$(echo "${AP_RESPONSE}" | jq -er 'select(.resourceType=="AccessPolicy") | .id // empty')" ||
  die "AccessPolicy create failed: $(echo "${AP_RESPONSE}" | jq -c .)"

echo "Created AccessPolicy/${AP_ID}"

PROJECT_JSON="$(curl -sS -H "$(auth_header)" "${FHIR}/Project/${E2E_PROJECT_ID}")"
echo "${PROJECT_JSON}" | jq -e '.resourceType == "Project"' >/dev/null 2>&1 ||
  die "GET Project failed: $(echo "${PROJECT_JSON}" | jq -c .)"

NEW_VALUE_JSON="$(jq -nc --arg ap "AccessPolicy/${AP_ID}" \
  '[{"resourceType":"Patient","access":[{"policy":{"reference":$ap}}]}]')"

if echo "${PROJECT_JSON}" | jq -e 'has("defaultAccessPolicy") and (.defaultAccessPolicy != null)' >/dev/null 2>&1; then
  PATCH_OP="replace"
else
  PATCH_OP="add"
fi

PATCH_BODY="$(jq -nc --arg op "${PATCH_OP}" --argjson val "${NEW_VALUE_JSON}" '[{"op":$op,"path":"/defaultAccessPolicy","value":$val}]')"

PATCH_ERR="$(mktemp "${TMPDIR:-/tmp}/medplum-e2e-patch-XXXXXX.json")"
trap 'rm -f "${PATCH_ERR}"' EXIT

echo "Patching Project/${E2E_PROJECT_ID} with defaultAccessPolicy (${PATCH_OP})..."
PATCH_RES="$(curl -sS -o "${PATCH_ERR}" -w '%{http_code}' -X PATCH \
  -H "$(auth_header)" \
  -H 'Content-Type: application/json-patch+json' \
  -d "${PATCH_BODY}" \
  "${FHIR}/Project/${E2E_PROJECT_ID}")"

if [[ "${PATCH_RES}" != "200" && "${PATCH_RES}" != "201" ]]; then
  echo "PATCH failed HTTP ${PATCH_RES}" >&2
  cat "${PATCH_ERR}" >&2
  exit 1
fi

mkdir -p "$(dirname "${STATE_FILE}")"
umask 077
jq -nc \
  --arg base "${BASE}" \
  --arg projectId "${E2E_PROJECT_ID}" \
  --arg accessPolicyId "${AP_ID}" \
  --arg token "${TOKEN}" \
  --argjson ts "$(date +%s)" \
  '{baseUrl:$base, projectId:$projectId, accessPolicyId:$accessPolicyId, accessToken:$token, savedAt:$ts}' \
  >"${STATE_FILE}"
if ! chmod 600 "${STATE_FILE}" 2>/dev/null; then
  echo "warning: chmod 600 failed for ${STATE_FILE}; review file permissions." >&2
fi

echo "Wrote state ${STATE_FILE} (contains access token — keep local)."
echo "Project snapshot:"
get_project | jq '{id, defaultPatientAccessPolicy, defaultAccessPolicy}'
