#!/usr/bin/env bash
# SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
# SPDX-License-Identifier: Apache-2.0
#
# E2E integration test for /auth/newpatient with Project.defaultAccessPolicy.
#
# Tests:
#  1. Project setup: new-style defaultAccessPolicy for Patient
#  2. Create project-scoped user+login (bypasses reCAPTCHA for API testing)
#  3. POST /auth/newpatient succeeds
#  4. Auth code is exchangeable for a patient token
#  5. Membership.access is set from Project.defaultAccessPolicy
#  6. Access policy is enforced: patient can read own Patient resource
#  7. Duplicate /auth/newpatient is rejected (login already has membership)
#  8. /auth/newpatient is blocked when project has no default policy
#  9. Legacy defaultPatientAccessPolicy is still honoured
# 10. New-style defaultAccessPolicy takes precedence over legacy
#
# Prerequisites: curl, jq, local Medplum server at http://localhost:8103
#
# Usage:
#   ./.cursor/scripts/test-newpatient.sh
set -euo pipefail

BASE="${MEDPLUM_BASE_URL:-http://localhost:8103}"
FHIR="$BASE/fhir/R4"
ADMIN_EMAIL="${MEDPLUM_ADMIN_EMAIL:-admin@example.com}"
ADMIN_PASS="${MEDPLUM_ADMIN_PASS:-medplum_admin}"

PASS=0; FAIL=0
ok()  { echo "  PASS: $*"; PASS=$((PASS+1)); }
die() { echo "  FAIL: $*" >&2; FAIL=$((FAIL+1)); exit 1; }
AUTH_TIME="$(date -u +%Y-%m-%dT%H:%M:%SZ)"

echo "### /auth/newpatient E2E – $(date)"
echo "    Server: $BASE"
echo ""

# ── Admin token ─────────────────────────────────────────────────────────────
_login=$(curl -sS -X POST "$BASE/auth/login" \
  -H 'Content-Type: application/json' \
  -d "{\"email\":\"$ADMIN_EMAIL\",\"password\":\"$ADMIN_PASS\",\"codeChallenge\":\"xyz\",\"codeChallengeMethod\":\"plain\"}")
_code=$(curl -sS -X POST "$BASE/auth/profile" \
  -H 'Content-Type: application/json' \
  -d "{\"login\":\"$(echo "$_login"|jq -er '.login')\",\"profile\":\"$(echo "$_login"|jq -er '.memberships[0].id')\"}" | jq -er '.code')
TOKEN=$(curl -sS -X POST "$BASE/oauth2/token" \
  -H 'Content-Type: application/x-www-form-urlencoded' \
  --data-urlencode 'grant_type=authorization_code' \
  --data-urlencode "code=$_code" \
  --data-urlencode 'code_verifier=xyz' | jq -er '.access_token')
AUTH="Authorization: Bearer $TOKEN"
echo "  Admin token OK"

# ── Helpers ─────────────────────────────────────────────────────────────────

make_project() {
  curl -sS -H "$AUTH" -H 'Content-Type: application/fhir+json' \
    -d "{\"resourceType\":\"Project\",\"name\":\"$1\",\"strictMode\":true}" \
    "$FHIR/Project"
}

make_ap() {
  local proj_id="$1"
  curl -sS -H "$AUTH" -H 'Content-Type: application/fhir+json' \
    -d "{\"resourceType\":\"AccessPolicy\",\"name\":\"PatDefault\",\"meta\":{\"project\":\"$proj_id\"},\"resource\":[{\"resourceType\":\"Patient\",\"criteria\":\"Patient?_id=%patient.id\"}]}" \
    "$FHIR/AccessPolicy"
}

# Create a project-scoped User + Login without going through reCAPTCHA
new_login() {
  local proj_id="$1" code="$2" ts="$3"
  local user_id
  user_id=$(curl -sS -H "$AUTH" -H 'Content-Type: application/fhir+json' \
    -d "{\"resourceType\":\"User\",\"firstName\":\"Test\",\"lastName\":\"Patient\",\"email\":\"np-$ts@example.com\",\"project\":{\"reference\":\"Project/$proj_id\"},\"meta\":{\"project\":\"$proj_id\"}}" \
    "$FHIR/User" | jq -er '.id') || die "create user"
  curl -sS -H "$AUTH" -H 'Content-Type: application/fhir+json' \
    -d "{\"resourceType\":\"Login\",\"user\":{\"reference\":\"User/$user_id\"},\"authMethod\":\"password\",\"authTime\":\"$AUTH_TIME\",\"code\":\"$code\",\"codeChallenge\":\"xyz\",\"codeChallengeMethod\":\"plain\"}" \
    "$FHIR/Login" | jq -er '.id'
}

get_patient_token() {
  curl -sS -X POST "$BASE/oauth2/token" \
    -H 'Content-Type: application/x-www-form-urlencoded' \
    --data-urlencode 'grant_type=authorization_code' \
    --data-urlencode "code=$1" \
    --data-urlencode 'code_verifier=xyz' | jq -er '.access_token'
}

# ── Test 1: Project setup ────────────────────────────────────────────────────
echo "--- 1. Project with new-style defaultAccessPolicy ---"
TS=$(date +%s)
PROJ=$(make_project "NewPatient E2E $TS")
PROJ_ID=$(echo "$PROJ"|jq -er '.id') || die "create project"
AP=$(make_ap "$PROJ_ID")
AP_ID=$(echo "$AP"|jq -er '.id') || die "create AP"
PATCH=$(curl -sS -X PATCH -H "$AUTH" -H 'Content-Type: application/json-patch+json' \
  -d "[{\"op\":\"add\",\"path\":\"/defaultAccessPolicy\",\"value\":[{\"resourceType\":\"Patient\",\"access\":[{\"policy\":{\"reference\":\"AccessPolicy/$AP_ID\"}}]}]}]" \
  "$FHIR/Project/$PROJ_ID")
echo "$PATCH"|jq -er '.id' > /dev/null || die "patch project: $(echo "$PATCH"|jq -c .)"
ok "Project/$PROJ_ID + AP/$AP_ID"

# ── Test 2: Create user+login ────────────────────────────────────────────────
echo "--- 2. Create project-scoped user+login ---"
LOGIN_ID=$(new_login "$PROJ_ID" "code-np-$TS" "$TS") || die "new_login"
ok "login=$LOGIN_ID"

# ── Test 3: /auth/newpatient succeeds ────────────────────────────────────────
echo "--- 3. POST /auth/newpatient ---"
RES_NP=$(curl -sS -X POST "$BASE/auth/newpatient" \
  -H 'Content-Type: application/json' \
  -d "{\"login\":\"$LOGIN_ID\",\"projectId\":\"$PROJ_ID\"}")
echo "  response: $(echo "$RES_NP"|jq -c .)"
CODE_PAT=$(echo "$RES_NP"|jq -er '.code // empty') || die "newpatient failed: $(echo "$RES_NP"|jq -c .)"
ok "returned code=$CODE_PAT"

# ── Test 4: Exchange code for patient token ──────────────────────────────────
echo "--- 4. Exchange code for patient token ---"
PAT_TOKEN=$(get_patient_token "$CODE_PAT")
[[ -n "$PAT_TOKEN" && "$PAT_TOKEN" != "null" ]] || die "no patient token"
ok "patient token obtained"

# ── Test 5: Membership.access from defaultAccessPolicy ──────────────────────
echo "--- 5. Verify membership.access set from Project.defaultAccessPolicy ---"
PAT_AUTH="Authorization: Bearer $PAT_TOKEN"
ME=$(curl -sS -H "$PAT_AUTH" "$BASE/auth/me")
MEM_ID=$(echo "$ME"|jq -er '.membership.id // empty') || die "no membership in /auth/me"
MEM=$(curl -sS -H "$AUTH" "$FHIR/ProjectMembership/$MEM_ID")
echo "  membership: $(echo "$MEM"|jq -c '{access,accessPolicy}')"
REF=$(echo "$MEM"|jq -er '.access[0].policy.reference // empty') || die "membership has no .access"
[[ "$REF" == "AccessPolicy/$AP_ID" ]] || die "wrong policy: $REF (expected AccessPolicy/$AP_ID)"
ok "membership.access[0].policy = $REF ✓"

# ── Test 6: Access policy enforced ──────────────────────────────────────────
echo "--- 6. Patient can read own Patient resource (policy enforced) ---"
PAT_SEARCH=$(curl -sS -H "$PAT_AUTH" "$FHIR/Patient")
PAT_CNT=$(echo "$PAT_SEARCH"|jq -er '.entry | length')
[[ "$PAT_CNT" -ge 1 ]] || die "patient cannot see own Patient (access policy not working; entry count=$PAT_CNT)"
ok "Patient search returned $PAT_CNT record(s) ✓"

# ── Test 7: Duplicate /auth/newpatient rejected ──────────────────────────────
echo "--- 7. Duplicate /auth/newpatient rejected ---"
RES_DUP=$(curl -sS -X POST "$BASE/auth/newpatient" \
  -H 'Content-Type: application/json' \
  -d "{\"login\":\"$LOGIN_ID\",\"projectId\":\"$PROJ_ID\"}")
DUP_RT=$(echo "$RES_DUP"|jq -er '.resourceType // empty')
[[ "$DUP_RT" == "OperationOutcome" ]] || die "expected OperationOutcome, got: $(echo "$RES_DUP"|jq -c .)"
ok "duplicate blocked: $(echo "$RES_DUP"|jq -er '.issue[0].details.text // .issue[0].diagnostics')"

# ── Test 8: Blocked when project has no default ──────────────────────────────
echo ""
echo "--- 8. Blocked: project has NO defaultAccessPolicy ---"
TS2=$((TS+1))
PROJ2=$(make_project "NoDefault $TS2")
PROJ2_ID=$(echo "$PROJ2"|jq -er '.id') || die "proj2"
LOGIN2_ID=$(new_login "$PROJ2_ID" "code-blk-$TS2" "$TS2") || die "login2"
RES_BLK=$(curl -sS -X POST "$BASE/auth/newpatient" \
  -H 'Content-Type: application/json' \
  -d "{\"login\":\"$LOGIN2_ID\",\"projectId\":\"$PROJ2_ID\"}")
echo "  blocked response: $(echo "$RES_BLK"|jq -c '{resourceType,issue}')"
[[ "$(echo "$RES_BLK"|jq -er '.resourceType')" == "OperationOutcome" ]] || die "expected OperationOutcome"
MSG_BLK=$(echo "$RES_BLK"|jq -er '.issue[0].details.text // .issue[0].diagnostics')
ok "blocked: '$MSG_BLK'"

# ── Test 9: Legacy defaultPatientAccessPolicy still works ───────────────────
echo ""
echo "--- 9. Legacy defaultPatientAccessPolicy is honoured ---"
TS3=$((TS+2))
PROJ3=$(make_project "Legacy $TS3")
PROJ3_ID=$(echo "$PROJ3"|jq -er '.id') || die "proj3"
AP_L=$(make_ap "$PROJ3_ID")
AP_L_ID=$(echo "$AP_L"|jq -er '.id') || die "legAP"
curl -sS -o /dev/null -X PATCH -H "$AUTH" -H 'Content-Type: application/json-patch+json' \
  -d "[{\"op\":\"add\",\"path\":\"/defaultPatientAccessPolicy\",\"value\":{\"reference\":\"AccessPolicy/$AP_L_ID\"}}]" \
  "$FHIR/Project/$PROJ3_ID"
LOGIN3_ID=$(new_login "$PROJ3_ID" "code-leg-$TS3" "$TS3") || die "login3"
RES_L=$(curl -sS -X POST "$BASE/auth/newpatient" \
  -H 'Content-Type: application/json' \
  -d "{\"login\":\"$LOGIN3_ID\",\"projectId\":\"$PROJ3_ID\"}")
CODE_L=$(echo "$RES_L"|jq -er '.code // empty') || die "legacy newpatient: $(echo "$RES_L"|jq -c .)"
PAT_L_TK=$(get_patient_token "$CODE_L")
MEM_L_ID=$(curl -sS -H "Authorization: Bearer $PAT_L_TK" "$BASE/auth/me" | jq -er '.membership.id // empty') || die "no membership (legacy)"
MEM_L=$(curl -sS -H "$AUTH" "$FHIR/ProjectMembership/$MEM_L_ID")
echo "  legacy membership: $(echo "$MEM_L"|jq -c '{access,accessPolicy}')"
LEG_REF=$(echo "$MEM_L"|jq -er '.accessPolicy.reference // empty') || die "no .accessPolicy on legacy membership"
[[ "$LEG_REF" == "AccessPolicy/$AP_L_ID" ]] || die "legacy mismatch: got $LEG_REF"
ok "legacy: membership.accessPolicy=$LEG_REF ✓"

# ── Test 10: New-style wins over legacy ─────────────────────────────────────
echo ""
echo "--- 10. defaultAccessPolicy takes precedence over defaultPatientAccessPolicy ---"
TS4=$((TS+3))
PROJ4=$(make_project "Precedence $TS4")
PROJ4_ID=$(echo "$PROJ4"|jq -er '.id') || die "proj4"
AP_NEW=$(make_ap "$PROJ4_ID")
AP_NEW_ID=$(echo "$AP_NEW"|jq -er '.id') || die "newAP"
AP_OLD=$(make_ap "$PROJ4_ID")
AP_OLD_ID=$(echo "$AP_OLD"|jq -er '.id') || die "oldAP"
P4=$(curl -sS -X PATCH -H "$AUTH" -H 'Content-Type: application/json-patch+json' \
  -d "[{\"op\":\"add\",\"path\":\"/defaultAccessPolicy\",\"value\":[{\"resourceType\":\"Patient\",\"access\":[{\"policy\":{\"reference\":\"AccessPolicy/$AP_NEW_ID\"}}]}]},{\"op\":\"add\",\"path\":\"/defaultPatientAccessPolicy\",\"value\":{\"reference\":\"AccessPolicy/$AP_OLD_ID\"}}]" \
  "$FHIR/Project/$PROJ4_ID")
echo "$P4"|jq -er '.id' > /dev/null || die "patch4: $(echo "$P4"|jq -c .)"
LOGIN4_ID=$(new_login "$PROJ4_ID" "code-prec-$TS4" "$TS4") || die "login4"
RES4=$(curl -sS -X POST "$BASE/auth/newpatient" \
  -H 'Content-Type: application/json' \
  -d "{\"login\":\"$LOGIN4_ID\",\"projectId\":\"$PROJ4_ID\"}")
CODE4=$(echo "$RES4"|jq -er '.code // empty') || die "prec newpatient: $(echo "$RES4"|jq -c .)"
PAT4_TK=$(get_patient_token "$CODE4")
MEM4_ID=$(curl -sS -H "Authorization: Bearer $PAT4_TK" "$BASE/auth/me" | jq -er '.membership.id // empty') || die "no membership (prec)"
MEM4=$(curl -sS -H "$AUTH" "$FHIR/ProjectMembership/$MEM4_ID")
echo "  prec membership: $(echo "$MEM4"|jq -c '{access,accessPolicy}')"
PREC_REF=$(echo "$MEM4"|jq -er '.access[0].policy.reference // empty') || die "no .access on membership (precedence)"
[[ "$PREC_REF" == "AccessPolicy/$AP_NEW_ID" ]] || die "precedence wrong: got $PREC_REF, expected AccessPolicy/$AP_NEW_ID"
LEGACY_SET=$(echo "$MEM4"|jq -r '.accessPolicy // ""')
[[ -z "$LEGACY_SET" || "$LEGACY_SET" == "null" ]] || die "legacy .accessPolicy should NOT be set when new-style wins: $LEGACY_SET"
ok "new-style wins: .access[0].policy=$PREC_REF, .accessPolicy unset ✓"

echo ""
echo "======================================="
echo " /auth/newpatient: $PASS PASSED, $FAIL FAILED"
if [[ "$FAIL" -eq 0 ]]; then
  echo " ALL TESTS PASSED ✓"
else
  echo " SOME TESTS FAILED ✗" >&2
  exit 1
fi
echo "======================================="
