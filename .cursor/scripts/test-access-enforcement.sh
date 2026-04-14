#!/usr/bin/env bash
# SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
# SPDX-License-Identifier: Apache-2.0
#
# E2E access policy ENFORCEMENT test for Project.defaultAccessPolicy.
#
# This test goes beyond checking that access is "set" — it creates data
# belonging to ANOTHER patient in the same project and proves the test
# patient (registered via /auth/newpatient) cannot see it.
#
# Tests:
#  1.  Project + AccessPolicy (Patient:self-only + Observation:self-only)
#  2.  Admin creates "other patient" + Observation (should remain hidden)
#  3.  Register test patient via /auth/newpatient; get patient token
#  4.  Admin creates Observation for test patient (should be visible)
#  5.  Patient CAN read own Patient resource
#  6.  Patient CANNOT read other patient's Patient (access denied)
#  7.  Patient search returns only own patient (not all patients in project)
#  8.  Patient CAN read own Observation
#  9.  Patient CANNOT read other patient's Observation
# 10.  Observation search returns only own observations (no cross-patient leak)
# 11.  Patient CANNOT access resource type not in policy (Practitioner)
#
# Usage:
#   ./.cursor/scripts/test-access-enforcement.sh
set -euo pipefail

BASE="${MEDPLUM_BASE_URL:-http://localhost:8103}"
FHIR="$BASE/fhir/R4"
ADMIN_EMAIL="${MEDPLUM_ADMIN_EMAIL:-admin@example.com}"
ADMIN_PASS="${MEDPLUM_ADMIN_PASS:-medplum_admin}"

PASS=0; FAIL=0
ok()  { echo "  PASS: $*"; PASS=$((PASS+1)); }
die() { echo "  FAIL: $*" >&2; FAIL=$((FAIL+1)); exit 1; }
AUTH_TIME="$(date -u +%Y-%m-%dT%H:%M:%SZ)"

echo "### Access policy ENFORCEMENT test – $(date)"
echo "    (Confirms registered patients CANNOT see other patients' data)"
echo "    Server: $BASE"
echo ""

# ── Admin token ─────────────────────────────────────────────────────────────
_l=$(curl -sS -X POST "$BASE/auth/login" \
  -H 'Content-Type: application/json' \
  -d "{\"email\":\"$ADMIN_EMAIL\",\"password\":\"$ADMIN_PASS\",\"codeChallenge\":\"xyz\",\"codeChallengeMethod\":\"plain\"}")
_c=$(curl -sS -X POST "$BASE/auth/profile" \
  -H 'Content-Type: application/json' \
  -d "{\"login\":\"$(echo "$_l"|jq -er '.login')\",\"profile\":\"$(echo "$_l"|jq -er '.memberships[0].id')\"}" | jq -er '.code')
TOKEN=$(curl -sS -X POST "$BASE/oauth2/token" \
  -H 'Content-Type: application/x-www-form-urlencoded' \
  --data-urlencode 'grant_type=authorization_code' \
  --data-urlencode "code=$_c" \
  --data-urlencode 'code_verifier=xyz' | jq -er '.access_token')
AUTH="Authorization: Bearer $TOKEN"
echo "  Admin token OK"

TS=$(date +%s)

# ── 1. Project + AccessPolicy ────────────────────────────────────────────────
echo "--- 1. Create project with self-scoped AccessPolicy ---"
PROJ=$(curl -sS -H "$AUTH" -H 'Content-Type: application/fhir+json' \
  -d "{\"resourceType\":\"Project\",\"name\":\"Enforcement E2E $TS\",\"strictMode\":true}" \
  "$FHIR/Project")
PROJ_ID=$(echo "$PROJ"|jq -er '.id') || die "create project"

AP=$(curl -sS -H "$AUTH" -H 'Content-Type: application/fhir+json' \
  -d "{\"resourceType\":\"AccessPolicy\",\"name\":\"SelfOnly\",\"meta\":{\"project\":\"$PROJ_ID\"},\"resource\":[{\"resourceType\":\"Patient\",\"criteria\":\"Patient?_id=%patient.id\"},{\"resourceType\":\"Observation\",\"criteria\":\"Observation?subject=%patient\"}]}" \
  "$FHIR/AccessPolicy")
AP_ID=$(echo "$AP"|jq -er '.id') || die "create AP"

PATCH=$(curl -sS -X PATCH -H "$AUTH" -H 'Content-Type: application/json-patch+json' \
  -d "[{\"op\":\"add\",\"path\":\"/defaultAccessPolicy\",\"value\":[{\"resourceType\":\"Patient\",\"access\":[{\"policy\":{\"reference\":\"AccessPolicy/$AP_ID\"}}]}]}]" \
  "$FHIR/Project/$PROJ_ID")
echo "$PATCH"|jq -er '.id' > /dev/null || die "patch project"
ok "Project/$PROJ_ID, AP: Patient?_id=%patient.id + Observation?subject=%patient"

# ── 2. Create "other patient" data (should stay hidden) ─────────────────────
echo "--- 2. Admin creates 'other patient' + their Observation ---"
OTHER_PAT=$(curl -sS -H "$AUTH" -H 'Content-Type: application/fhir+json' \
  -d "{\"resourceType\":\"Patient\",\"name\":[{\"family\":\"Other\",\"given\":[\"Patient\"]}],\"meta\":{\"project\":\"$PROJ_ID\"}}" \
  "$FHIR/Patient")
OTHER_PAT_ID=$(echo "$OTHER_PAT"|jq -er '.id') || die "create other patient"

OTHER_OBS=$(curl -sS -H "$AUTH" -H 'Content-Type: application/fhir+json' \
  -d "{\"resourceType\":\"Observation\",\"status\":\"final\",\"code\":{\"coding\":[{\"system\":\"http://loinc.org\",\"code\":\"8867-4\",\"display\":\"Heart rate\"}]},\"subject\":{\"reference\":\"Patient/$OTHER_PAT_ID\"},\"valueQuantity\":{\"value\":72,\"unit\":\"bpm\"},\"meta\":{\"project\":\"$PROJ_ID\"}}" \
  "$FHIR/Observation")
OTHER_OBS_ID=$(echo "$OTHER_OBS"|jq -er '.id') || die "create other observation"
ok "Other: Patient/$OTHER_PAT_ID + Observation/$OTHER_OBS_ID (should be invisible to test patient)"

# ── 3. Register test patient via /auth/newpatient ────────────────────────────
echo "--- 3. Register test patient via /auth/newpatient ---"
USER_ID=$(curl -sS -H "$AUTH" -H 'Content-Type: application/fhir+json' \
  -d "{\"resourceType\":\"User\",\"firstName\":\"Test\",\"lastName\":\"Subject\",\"email\":\"enforce-$TS@example.com\",\"project\":{\"reference\":\"Project/$PROJ_ID\"},\"meta\":{\"project\":\"$PROJ_ID\"}}" \
  "$FHIR/User" | jq -er '.id') || die "create user"
LOGIN_ID=$(curl -sS -H "$AUTH" -H 'Content-Type: application/fhir+json' \
  -d "{\"resourceType\":\"Login\",\"user\":{\"reference\":\"User/$USER_ID\"},\"authMethod\":\"password\",\"authTime\":\"$AUTH_TIME\",\"code\":\"code-enforce-$TS\",\"codeChallenge\":\"xyz\",\"codeChallengeMethod\":\"plain\"}" \
  "$FHIR/Login" | jq -er '.id') || die "create login"
NP_RESP=$(curl -sS -X POST "$BASE/auth/newpatient" \
  -H 'Content-Type: application/json' \
  -d "{\"login\":\"$LOGIN_ID\",\"projectId\":\"$PROJ_ID\"}")
NP_CODE=$(echo "$NP_RESP"|jq -er '.code // empty') || die "newpatient: $(echo "$NP_RESP"|jq -c .)"
PAT_TOKEN=$(curl -sS -X POST "$BASE/oauth2/token" \
  -H 'Content-Type: application/x-www-form-urlencoded' \
  --data-urlencode 'grant_type=authorization_code' \
  --data-urlencode "code=$NP_CODE" \
  --data-urlencode 'code_verifier=xyz' | jq -er '.access_token')
PAT_AUTH="Authorization: Bearer $PAT_TOKEN"
OWN_PAT_ID=$(curl -sS -H "$PAT_AUTH" "$BASE/auth/me" | jq -er '.profile.id')
ok "Test patient registered: Patient/$OWN_PAT_ID (membership has policy AccessPolicy/$AP_ID)"

# ── 4. Admin creates Observation for test patient ────────────────────────────
echo "--- 4. Admin creates Observation for test patient ---"
OWN_OBS=$(curl -sS -H "$AUTH" -H 'Content-Type: application/fhir+json' \
  -d "{\"resourceType\":\"Observation\",\"status\":\"final\",\"code\":{\"coding\":[{\"system\":\"http://loinc.org\",\"code\":\"29463-7\",\"display\":\"Body weight\"}]},\"subject\":{\"reference\":\"Patient/$OWN_PAT_ID\"},\"valueQuantity\":{\"value\":70,\"unit\":\"kg\"},\"meta\":{\"project\":\"$PROJ_ID\"}}" \
  "$FHIR/Observation")
OWN_OBS_ID=$(echo "$OWN_OBS"|jq -er '.id') || die "create own observation"
ok "Own Observation/$OWN_OBS_ID (should be visible to test patient)"

# ── 5. Patient CAN read own Patient ─────────────────────────────────────────
echo ""
echo "--- 5. [allow] Patient reads own Patient ---"
R=$(curl -sS -H "$PAT_AUTH" "$FHIR/Patient/$OWN_PAT_ID")
[[ "$(echo "$R"|jq -er '.resourceType')" == "Patient" ]] || die "own Patient: $(echo "$R"|jq -c .)"
ok "GET Patient/$OWN_PAT_ID → Patient ✓"

# ── 6. Patient CANNOT read other patient's Patient ───────────────────────────
echo "--- 6. [deny]  Patient reads other patient's Patient ---"
R=$(curl -sS -H "$PAT_AUTH" "$FHIR/Patient/$OTHER_PAT_ID")
RT=$(echo "$R"|jq -er '.resourceType')
[[ "$RT" == "OperationOutcome" ]] || die "should be denied, got $RT: $(echo "$R"|jq -c .)"
ok "GET Patient/$OTHER_PAT_ID → OperationOutcome (access denied) ✓"

# ── 7. Patient search returns only own patient ───────────────────────────────
echo "--- 7. [scope] Patient search is scoped to own patient only ---"
SRCH=$(curl -sS -H "$PAT_AUTH" "$FHIR/Patient")
IDS=$(echo "$SRCH"|jq -r '[.entry[].resource.id] | sort | join(",")')
echo "  search result IDs: [${IDS:-<empty>}]"
[[ "$IDS" == "$OWN_PAT_ID" ]] || die "leaked other patients; got [$IDS], expected [$OWN_PAT_ID]"
ok "Patient search: 1 result (own patient only) — other patient NOT visible ✓"

# ── 8. Patient CAN read own Observation ─────────────────────────────────────
echo "--- 8. [allow] Patient reads own Observation ---"
R=$(curl -sS -H "$PAT_AUTH" "$FHIR/Observation/$OWN_OBS_ID")
[[ "$(echo "$R"|jq -er '.resourceType')" == "Observation" ]] || die "own Observation: $(echo "$R"|jq -c .)"
ok "GET Observation/$OWN_OBS_ID → Observation ✓"

# ── 9. Patient CANNOT read other patient's Observation ──────────────────────
echo "--- 9. [deny]  Patient reads other patient's Observation ---"
R=$(curl -sS -H "$PAT_AUTH" "$FHIR/Observation/$OTHER_OBS_ID")
RT=$(echo "$R"|jq -er '.resourceType')
[[ "$RT" == "OperationOutcome" ]] || die "should be denied, got $RT: $(echo "$R"|jq -c .)"
ok "GET Observation/$OTHER_OBS_ID → OperationOutcome (access denied) ✓"

# ── 10. Observation search is scoped ────────────────────────────────────────
echo "--- 10. [scope] Observation search is scoped to own observations only ---"
OBS_SRCH=$(curl -sS -H "$PAT_AUTH" "$FHIR/Observation")
OBS_IDS=$(echo "$OBS_SRCH"|jq -r '[.entry[].resource.id] | sort | join(",")')
echo "  observation search IDs: [${OBS_IDS:-<empty>}]"
[[ "$OBS_IDS" == "$OWN_OBS_ID" ]] || die "Observation search leaked: got [$OBS_IDS], expected [$OWN_OBS_ID]"
ok "Observation search: 1 result (own only) — other patient's NOT visible ✓"

# ── 11. Resource type not in policy is blocked ───────────────────────────────
echo "--- 11. [deny]  Resource type not in policy (Practitioner) is blocked ---"
PR=$(curl -sS -H "$PAT_AUTH" "$FHIR/Practitioner")
PR_RT=$(echo "$PR"|jq -er '.resourceType')
if [[ "$PR_RT" == "OperationOutcome" ]]; then
  ok "GET Practitioner → OperationOutcome (resource type not in policy) ✓"
elif [[ "$PR_RT" == "Bundle" ]]; then
  CNT=$(echo "$PR"|jq -r '.entry | length')
  [[ "$CNT" -eq 0 ]] && ok "GET Practitioner → empty Bundle (no access) ✓" \
    || die "Practitioner returned $CNT results — should be empty"
else
  die "unexpected response type: $PR_RT"
fi

echo ""
echo "============================================="
echo " Enforcement: $PASS PASSED, $FAIL FAILED"
if [[ "$FAIL" -eq 0 ]]; then
  echo " ALL ENFORCEMENT TESTS PASSED ✓"
  echo ""
  echo " Summary:"
  echo "   Own Patient/$OWN_PAT_ID    → VISIBLE ✓"
  echo "   Other Patient/$OTHER_PAT_ID  → BLOCKED ✓"
  echo "   Own Observation/$OWN_OBS_ID  → VISIBLE ✓"
  echo "   Other Observation/$OTHER_OBS_ID → BLOCKED ✓"
else
  echo " SOME TESTS FAILED ✗" >&2
  exit 1
fi
echo "============================================="
