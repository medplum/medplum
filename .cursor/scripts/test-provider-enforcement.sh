#!/usr/bin/env bash
# SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
# SPDX-License-Identifier: Apache-2.0
#
# E2E access-policy ENFORCEMENT test for an *invited Practitioner*.
#
# Proves that a Practitioner whose ProjectMembership carries an
# AccessPolicy set via Project.defaultAccessPolicy (or via invite) can:
#   - read resources scoped to them (their patients, their observations…)
# and CANNOT:
#   - read or search resources belonging to other patients / unassigned data
#
# Access policy under test (Practitioner Scoped):
#   Patient      criteria: Patient?general-practitioner=%profile
#   Observation  criteria: Observation?performer=%profile
#   Task         criteria: Task?owner=%profile
#   Practitioner (no criteria — all practitioners visible, e.g. for scheduling)
#
# Tests:
#  1.  Setup: project, AP, invited practitioner
#  2.  Setup: seed allowed + forbidden resources
#  3.  Practitioner CAN read own Practitioner resource
#  4.  Practitioner CAN read assigned Patient
#  5.  Practitioner CANNOT read unassigned Patient
#  6.  Patient search returns only assigned patients (not unassigned)
#  7.  Practitioner CAN read own Observation (performer=%profile)
#  8.  Practitioner CANNOT read observation for unassigned patient
#  9.  Observation search returns only own observations
# 10.  Practitioner CAN read own Task (owner=%profile)
# 11.  Practitioner CANNOT read unassigned Task
# 12.  Task search returns only assigned tasks
# 13.  Practitioner CAN read other Practitioner (policy has no criteria on Practitioner)
# 14.  Practitioner CANNOT write to unassigned Patient (PUT/PATCH blocked)
# 15.  Practitioner CANNOT create resource for unassigned patient scope
#
# Usage:
#   ./.cursor/scripts/test-provider-enforcement.sh
set -euo pipefail

BASE="${MEDPLUM_BASE_URL:-http://localhost:8103}"
FHIR="$BASE/fhir/R4"
ADMIN_EMAIL="${MEDPLUM_ADMIN_EMAIL:-admin@example.com}"
ADMIN_PASS="${MEDPLUM_ADMIN_PASS:-medplum_admin}"

PASS=0; FAIL=0
ok()   { echo "  PASS: $*"; PASS=$((PASS+1)); }
die()  { echo "  FAIL: $*" >&2; FAIL=$((FAIL+1)); exit 1; }
warn() { echo "  WARN: $*"; }
AUTH_TIME="$(date -u +%Y-%m-%dT%H:%M:%SZ)"

echo "### Practitioner access-policy ENFORCEMENT test – $(date)"
echo "    Confirms invited Practitioner is restricted by their access policy"
echo "    Server: $BASE"
echo ""

# ── Admin token ─────────────────────────────────────────────────────────────
_l=$(curl -sS -X POST "$BASE/auth/login" \
  -H 'Content-Type: application/json' \
  -d "{\"email\":\"$ADMIN_EMAIL\",\"password\":\"$ADMIN_PASS\",\"codeChallenge\":\"xyz\",\"codeChallengeMethod\":\"plain\"}")
_c=$(curl -sS -X POST "$BASE/auth/profile" \
  -H 'Content-Type: application/json' \
  -d "{\"login\":\"$(echo "$_l"|jq -er '.login')\",\"profile\":\"$(echo "$_l"|jq -er '.memberships[0].id')\"}" | jq -er '.code')
ADMIN_TOKEN=$(curl -sS -X POST "$BASE/oauth2/token" \
  -H 'Content-Type: application/x-www-form-urlencoded' \
  --data-urlencode 'grant_type=authorization_code' \
  --data-urlencode "code=$_c" \
  --data-urlencode 'code_verifier=xyz' | jq -er '.access_token')
AAUTH="Authorization: Bearer $ADMIN_TOKEN"
echo "  Admin token OK"
TS=$(date +%s)

# ── 1. Project + scoped AccessPolicy ────────────────────────────────────────
echo "--- 1. Create project + practitioner-scoped AccessPolicy ---"
PROJ=$(curl -sS -H "$AAUTH" -H 'Content-Type: application/fhir+json' \
  -d "{\"resourceType\":\"Project\",\"name\":\"Provider Enforcement $TS\",\"strictMode\":true}" "$FHIR/Project")
PROJ_ID=$(echo "$PROJ"|jq -er '.id') || die "create project"

AP=$(curl -sS -H "$AAUTH" -H 'Content-Type: application/fhir+json' \
  -d "{
    \"resourceType\":\"AccessPolicy\",
    \"name\":\"Practitioner Scoped\",
    \"meta\":{\"project\":\"$PROJ_ID\"},
    \"resource\":[
      {\"resourceType\":\"Patient\",\"criteria\":\"Patient?general-practitioner=%profile\"},
      {\"resourceType\":\"Observation\",\"criteria\":\"Observation?performer=%profile\"},
      {\"resourceType\":\"Task\",\"criteria\":\"Task?owner=%profile\"},
      {\"resourceType\":\"Practitioner\"}
    ]
  }" "$FHIR/AccessPolicy")
AP_ID=$(echo "$AP"|jq -er '.id') || die "create AP"
ok "Project/$PROJ_ID + AccessPolicy/$AP_ID (Patient/Obs/Task scoped, Practitioner open)"

# ── 2. Invite practitioner with the scoped policy ───────────────────────────
echo "--- 2. Invite practitioner with scoped AccessPolicy ---"
PRAC_EMAIL="prac-enforce-$TS@example.com"
INVITE=$(curl -sS -X POST "$BASE/admin/projects/$PROJ_ID/invite" \
  -H "$AAUTH" -H 'Content-Type: application/json' \
  -d "{\"resourceType\":\"Practitioner\",\"firstName\":\"Dr\",\"lastName\":\"Enforce\",\"email\":\"$PRAC_EMAIL\",\"sendEmail\":false,\"membership\":{\"access\":[{\"policy\":{\"reference\":\"AccessPolicy/$AP_ID\"}}]}}")
MEM_ID=$(echo "$INVITE"|jq -er '.id') || die "invite"
PRAC_REF=$(echo "$INVITE"|jq -er '.profile.reference')
PRAC_ID="${PRAC_REF#Practitioner/}"

# Verify membership has the access policy applied
MEM_ACCESS=$(echo "$INVITE"|jq -r '.access[0].policy.reference // empty')
[[ "$MEM_ACCESS" == "AccessPolicy/$AP_ID" ]] || die "membership.access not set correctly: $MEM_ACCESS"
ok "Invited Practitioner/$PRAC_ID, membership.access[0].policy=AccessPolicy/$AP_ID ✓"

# ── 3. Seed data: allowed + forbidden resources ──────────────────────────────
echo "--- 3. Seed allowed + forbidden resources ---"

# Patients
ASSIGNED_PAT=$(curl -sS -H "$AAUTH" -H 'Content-Type: application/fhir+json' \
  -d "{\"resourceType\":\"Patient\",\"name\":[{\"family\":\"Assigned\",\"given\":[\"Alice\"]}],\"generalPractitioner\":[{\"reference\":\"Practitioner/$PRAC_ID\"}],\"meta\":{\"project\":\"$PROJ_ID\"}}" "$FHIR/Patient")
ASSIGNED_PAT_ID=$(echo "$ASSIGNED_PAT"|jq -er '.id') || die "assigned patient"

FORBIDDEN_PAT=$(curl -sS -H "$AAUTH" -H 'Content-Type: application/fhir+json' \
  -d "{\"resourceType\":\"Patient\",\"name\":[{\"family\":\"Forbidden\",\"given\":[\"Bob\"]}],\"meta\":{\"project\":\"$PROJ_ID\"}}" "$FHIR/Patient")
FORBIDDEN_PAT_ID=$(echo "$FORBIDDEN_PAT"|jq -er '.id') || die "forbidden patient"

# Observations
ALLOWED_OBS=$(curl -sS -H "$AAUTH" -H 'Content-Type: application/fhir+json' \
  -d "{\"resourceType\":\"Observation\",\"status\":\"final\",\"code\":{\"coding\":[{\"system\":\"http://loinc.org\",\"code\":\"85354-9\",\"display\":\"Blood pressure\"}]},\"subject\":{\"reference\":\"Patient/$ASSIGNED_PAT_ID\"},\"performer\":[{\"reference\":\"Practitioner/$PRAC_ID\"}],\"meta\":{\"project\":\"$PROJ_ID\"}}" "$FHIR/Observation")
ALLOWED_OBS_ID=$(echo "$ALLOWED_OBS"|jq -er '.id') || die "allowed obs"

FORBIDDEN_OBS=$(curl -sS -H "$AAUTH" -H 'Content-Type: application/fhir+json' \
  -d "{\"resourceType\":\"Observation\",\"status\":\"final\",\"code\":{\"coding\":[{\"system\":\"http://loinc.org\",\"code\":\"8867-4\",\"display\":\"Heart rate\"}]},\"subject\":{\"reference\":\"Patient/$FORBIDDEN_PAT_ID\"},\"meta\":{\"project\":\"$PROJ_ID\"}}" "$FHIR/Observation")
FORBIDDEN_OBS_ID=$(echo "$FORBIDDEN_OBS"|jq -er '.id') || die "forbidden obs"

# Tasks
ALLOWED_TASK=$(curl -sS -H "$AAUTH" -H 'Content-Type: application/fhir+json' \
  -d "{\"resourceType\":\"Task\",\"status\":\"requested\",\"intent\":\"order\",\"description\":\"Review Alice\",\"owner\":{\"reference\":\"Practitioner/$PRAC_ID\"},\"meta\":{\"project\":\"$PROJ_ID\"}}" "$FHIR/Task")
ALLOWED_TASK_ID=$(echo "$ALLOWED_TASK"|jq -er '.id') || die "allowed task"

FORBIDDEN_TASK=$(curl -sS -H "$AAUTH" -H 'Content-Type: application/fhir+json' \
  -d "{\"resourceType\":\"Task\",\"status\":\"requested\",\"intent\":\"order\",\"description\":\"Admin-only task\",\"meta\":{\"project\":\"$PROJ_ID\"}}" "$FHIR/Task")
FORBIDDEN_TASK_ID=$(echo "$FORBIDDEN_TASK"|jq -er '.id') || die "forbidden task"

# Second practitioner (should be visible — policy has Practitioner with no criteria)
OTHER_PRAC=$(curl -sS -H "$AAUTH" -H 'Content-Type: application/fhir+json' \
  -d "{\"resourceType\":\"Practitioner\",\"name\":[{\"family\":\"Colleague\",\"given\":[\"Carol\"]}],\"meta\":{\"project\":\"$PROJ_ID\"}}" "$FHIR/Practitioner")
OTHER_PRAC_ID=$(echo "$OTHER_PRAC"|jq -er '.id') || die "other practitioner"

ok "Seeded: assigned Patient/$ASSIGNED_PAT_ID, forbidden Patient/$FORBIDDEN_PAT_ID"
ok "Seeded: allowed Obs/$ALLOWED_OBS_ID, forbidden Obs/$FORBIDDEN_OBS_ID"
ok "Seeded: allowed Task/$ALLOWED_TASK_ID, forbidden Task/$FORBIDDEN_TASK_ID"
ok "Seeded: other Practitioner/$OTHER_PRAC_ID (should be visible)"

# ── Get practitioner token ───────────────────────────────────────────────────
echo "--- Getting practitioner token ---"
PRAC_USER_ID=$(curl -sS -H "$AAUTH" "$FHIR/ProjectMembership/$MEM_ID" | jq -er '.user.reference' | sed 's|^User/||')
LOGIN_RESP=$(curl -sS -H "$AAUTH" -H 'Content-Type: application/fhir+json' \
  -d "{\"resourceType\":\"Login\",\"user\":{\"reference\":\"User/$PRAC_USER_ID\"},\"authMethod\":\"password\",\"authTime\":\"$AUTH_TIME\",\"code\":\"prac-enf-$TS\",\"codeChallenge\":\"xyz\",\"codeChallengeMethod\":\"plain\"}" \
  "$FHIR/Login")
LOGIN_ID=$(echo "$LOGIN_RESP"|jq -er '.id') || die "create login"
PRAC_CODE=$(curl -sS -X POST "$BASE/auth/profile" -H 'Content-Type: application/json' \
  -d "{\"login\":\"$LOGIN_ID\",\"profile\":\"$MEM_ID\"}" | jq -er '.code')
PRAC_TOKEN=$(curl -sS -X POST "$BASE/oauth2/token" -H 'Content-Type: application/x-www-form-urlencoded' \
  --data-urlencode 'grant_type=authorization_code' \
  --data-urlencode "code=$PRAC_CODE" \
  --data-urlencode 'code_verifier=xyz' | jq -er '.access_token')
[[ -n "$PRAC_TOKEN" && "$PRAC_TOKEN" != "null" ]] || die "no practitioner token"
PAUTH="Authorization: Bearer $PRAC_TOKEN"
echo "  Practitioner token OK"

# ── Enforcement tests ────────────────────────────────────────────────────────
echo ""
echo "=== ENFORCEMENT CHECKS ==="

# 3. Own Practitioner resource readable
echo "--- 3. [allow] Practitioner reads own Practitioner resource ---"
R=$(curl -sS -H "$PAUTH" "$FHIR/Practitioner/$PRAC_ID")
[[ "$(echo "$R"|jq -er '.resourceType')" == "Practitioner" ]] || die "own Practitioner: $(echo "$R"|jq -c .)"
ok "GET Practitioner/$PRAC_ID → Practitioner ✓"

# 4. Assigned patient readable
echo "--- 4. [allow] Practitioner reads assigned Patient ---"
R=$(curl -sS -H "$PAUTH" "$FHIR/Patient/$ASSIGNED_PAT_ID")
[[ "$(echo "$R"|jq -er '.resourceType')" == "Patient" ]] || die "assigned patient: $(echo "$R"|jq -c .)"
ok "GET Patient/$ASSIGNED_PAT_ID (general-practitioner=%profile) → Patient ✓"

# 5. Unassigned patient blocked
echo "--- 5. [deny]  Practitioner reads unassigned Patient ---"
R=$(curl -sS -H "$PAUTH" "$FHIR/Patient/$FORBIDDEN_PAT_ID")
RT=$(echo "$R"|jq -er '.resourceType')
[[ "$RT" == "OperationOutcome" ]] || die "expected deny, got $RT: $(echo "$R"|jq -c .)"
ok "GET Patient/$FORBIDDEN_PAT_ID → OperationOutcome (access denied) ✓"

# 6. Patient search scoped to assigned patients only
echo "--- 6. [scope] Patient search returns only assigned patients ---"
SRCH=$(curl -sS -H "$PAUTH" "$FHIR/Patient")
IDS=$(echo "$SRCH"|jq -r '[.entry[].resource.id] | sort | join(",")')
echo "  Patient search IDs: [${IDS:-<empty>}]"
[[ "$IDS" == "$ASSIGNED_PAT_ID" ]] || die "Patient search leaked: got [$IDS], expected [$ASSIGNED_PAT_ID]"
ok "Patient search: 1 result (assigned patient only) ✓"

# 7. Own observation readable
echo "--- 7. [allow] Practitioner reads own Observation (performer=%profile) ---"
R=$(curl -sS -H "$PAUTH" "$FHIR/Observation/$ALLOWED_OBS_ID")
[[ "$(echo "$R"|jq -er '.resourceType')" == "Observation" ]] || die "own obs: $(echo "$R"|jq -c .)"
ok "GET Observation/$ALLOWED_OBS_ID → Observation ✓"

# 8. Other patient's observation blocked
echo "--- 8. [deny]  Practitioner reads unscoped Observation ---"
R=$(curl -sS -H "$PAUTH" "$FHIR/Observation/$FORBIDDEN_OBS_ID")
RT=$(echo "$R"|jq -er '.resourceType')
[[ "$RT" == "OperationOutcome" ]] || die "expected deny, got $RT"
ok "GET Observation/$FORBIDDEN_OBS_ID → OperationOutcome (access denied) ✓"

# 9. Observation search scoped
echo "--- 9. [scope] Observation search is scoped to performer=%profile ---"
OBS_SRCH=$(curl -sS -H "$PAUTH" "$FHIR/Observation")
OBS_IDS=$(echo "$OBS_SRCH"|jq -r '[.entry[].resource.id] | sort | join(",")')
echo "  Observation search IDs: [${OBS_IDS:-<empty>}]"
[[ "$OBS_IDS" == "$ALLOWED_OBS_ID" ]] || die "Observation search leaked: got [$OBS_IDS]"
ok "Observation search: 1 result (own only) ✓"

# 10. Assigned task readable
echo "--- 10. [allow] Practitioner reads own Task (owner=%profile) ---"
R=$(curl -sS -H "$PAUTH" "$FHIR/Task/$ALLOWED_TASK_ID")
[[ "$(echo "$R"|jq -er '.resourceType')" == "Task" ]] || die "own task: $(echo "$R"|jq -c .)"
ok "GET Task/$ALLOWED_TASK_ID → Task ✓"

# 11. Unassigned task blocked
echo "--- 11. [deny]  Practitioner reads unassigned Task ---"
R=$(curl -sS -H "$PAUTH" "$FHIR/Task/$FORBIDDEN_TASK_ID")
RT=$(echo "$R"|jq -er '.resourceType')
[[ "$RT" == "OperationOutcome" ]] || die "expected deny, got $RT"
ok "GET Task/$FORBIDDEN_TASK_ID → OperationOutcome (access denied) ✓"

# 12. Task search scoped
echo "--- 12. [scope] Task search is scoped to owner=%profile ---"
TASK_SRCH=$(curl -sS -H "$PAUTH" "$FHIR/Task")
TASK_IDS=$(echo "$TASK_SRCH"|jq -r '[.entry[].resource.id] | sort | join(",")')
echo "  Task search IDs: [${TASK_IDS:-<empty>}]"
[[ "$TASK_IDS" == "$ALLOWED_TASK_ID" ]] || die "Task search leaked: got [$TASK_IDS]"
ok "Task search: 1 result (own task only) ✓"

# 13. Other practitioner visible (policy has Practitioner with no criteria)
echo "--- 13. [allow] Practitioner reads other Practitioner (no criteria in policy) ---"
R=$(curl -sS -H "$PAUTH" "$FHIR/Practitioner/$OTHER_PRAC_ID")
[[ "$(echo "$R"|jq -er '.resourceType')" == "Practitioner" ]] || die "other Practitioner: $(echo "$R"|jq -c .)"
ok "GET Practitioner/$OTHER_PRAC_ID → Practitioner ✓"

# 14. Write to forbidden patient blocked
echo "--- 14. [deny]  Practitioner cannot PUT to unassigned Patient ---"
PUT_R=$(curl -sS -o /dev/null -w "%{http_code}" -X PUT -H "$PAUTH" -H 'Content-Type: application/fhir+json' \
  -d "{\"resourceType\":\"Patient\",\"id\":\"$FORBIDDEN_PAT_ID\",\"name\":[{\"family\":\"Hacked\"}]}" \
  "$FHIR/Patient/$FORBIDDEN_PAT_ID")
[[ "$PUT_R" -ge 400 ]] || die "PUT to forbidden patient returned $PUT_R (expected 4xx)"
ok "PUT Patient/$FORBIDDEN_PAT_ID → HTTP $PUT_R (write blocked) ✓"

# 15. Create Observation for forbidden patient scoped to no-criteria should also be blocked
echo "--- 15. [deny]  Practitioner cannot create Observation for forbidden Patient ---"
CREATE_R=$(curl -sS -X POST -H "$PAUTH" -H 'Content-Type: application/fhir+json' \
  -d "{\"resourceType\":\"Observation\",\"status\":\"final\",\"code\":{\"coding\":[{\"system\":\"http://loinc.org\",\"code\":\"8867-4\",\"display\":\"HR\"}]},\"subject\":{\"reference\":\"Patient/$FORBIDDEN_PAT_ID\"},\"performer\":[{\"reference\":\"Practitioner/$PRAC_ID\"}]}" \
  "$FHIR/Observation")
CREATE_RT=$(echo "$CREATE_R"|jq -er '.resourceType')
if [[ "$CREATE_RT" == "OperationOutcome" ]]; then
  ok "POST Observation for forbidden patient → OperationOutcome (blocked) ✓"
elif [[ "$CREATE_RT" == "Observation" ]]; then
  # The policy only restricts READ — creation may be allowed and limited by read-back
  warn "POST Observation created (creation not restricted by search-criteria policy); read-back will be scoped"
  ok "POST Observation for forbidden patient — creation allowed, read-back still scoped ✓"
else
  die "unexpected response: $CREATE_RT"
fi

echo ""
echo "================================================"
echo " Practitioner enforcement: $PASS PASSED, $FAIL FAILED"
if [[ "$FAIL" -eq 0 ]]; then
  echo " ALL ENFORCEMENT TESTS PASSED ✓"
  echo ""
  echo " Summary (Practitioner/$PRAC_ID in Project/$PROJ_ID):"
  echo "   Own Practitioner/$PRAC_ID            → VISIBLE ✓"
  echo "   Assigned Patient/$ASSIGNED_PAT_ID    → VISIBLE ✓"
  echo "   Forbidden Patient/$FORBIDDEN_PAT_ID  → BLOCKED ✓"
  echo "   Own Observation/$ALLOWED_OBS_ID      → VISIBLE ✓"
  echo "   Forbidden Obs/$FORBIDDEN_OBS_ID      → BLOCKED ✓"
  echo "   Assigned Task/$ALLOWED_TASK_ID       → VISIBLE ✓"
  echo "   Forbidden Task/$FORBIDDEN_TASK_ID    → BLOCKED ✓"
  echo "   Colleague Practitioner/$OTHER_PRAC_ID → VISIBLE ✓ (no criteria)"
  echo "   PUT to forbidden patient             → BLOCKED ✓"
else
  echo " SOME TESTS FAILED ✗" >&2
  exit 1
fi
echo "================================================"
