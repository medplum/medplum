# CareDevi booking pilot — Medplum provisioning

Idempotent provisioning of one clinic's booking configuration into a Medplum project, per
`mycaredevi/docs/booking-pilot-contract.md` §1. The first clinic is Precision Direct Primary Care
(`clinics/precision-dpc.json`, meet-and-greet service).

This folder is CareDevi-only. Nothing under `packages/` (upstream Medplum) is modified.

| File | Purpose |
|---|---|
| `provision.mjs` | Provisioning script. Node ≥ 20, ESM, no npm dependencies (uses global `fetch`). |
| `clinics/precision-dpc.json` | PDPC clinic config (data only). Content ported from the mobile app's hard-coded screens. |
| `provision.test.mjs` | `node:test` unit tests for the pure builders and a no-network dry run. |

## What it provisions

Each resource is written with a FHIR **conditional update** (`PUT /fhir/R4/<Type>?<search>`). Re-running updates resources in place and never creates duplicates. References between resources are resolved from the ids each PUT returns.

| # | Resource | Upsert key | Notes |
|---|---|---|---|
| 1 | Organization | `identifier=https://caredevi.com/clinic\|<clinic slug>` | `app-content` extension (`valueString` = ClinicContent JSON, contract §1.1) |
| 2 | Location | `identifier=https://caredevi.com/location\|<slug>` | `managingOrganization`, address, position, telecom, `hoursOfOperation`, HL7 `timezone` ext |
| 3 | Practitioner(s) | `identifier=https://caredevi.com/practitioner\|<slug>` | name, photo, qualification, HL7 `timezone` ext |
| 4 | Questionnaire | `url=<questionnaire.url>` | intake form, `status: active` |
| 5 | HealthcareService(s) | `identifier=https://caredevi.com/service\|<service slug>` | `SchedulingParameters` (duration, alignment, timezone), `booking-config` JSON, `intake-questionnaire` canonical |
| 6 | PractitionerRole(s) | `identifier=https://caredevi.com/practitioner-role\|<clinic>--<practitioner>` | links practitioner, organization, location and services |
| 7 | Schedule(s) | `identifier=https://caredevi.com/schedule\|<slug>` | one Practitioner actor, `serviceType` → service, per-service `SchedulingParameters` (availability + timezone) |
| 8 | AccessPolicy | `name:exact=CareDevi Patient` | patient least-privilege policy (see below) |
| 9 | Subscription (backend) | `_tag=https://caredevi.com/subscription\|booking-pilot-backend` | `Appointment?status=booked,cancelled` → backend webhook, rest-hook + HMAC secret. R4 `Subscription` has no `identifier`, so a `meta.tag` is used instead. |
| (9b) | Subscription (Connect), **only with `--with-connect-subscription`** | `_tag=https://caredevi.com/subscription\|appointment-status` | Normally created by Connect itself (see *One Connect subscription per environment*). |

`location`, `practitioner`, `practitioner-role` and `subscription` are CareDevi-owned identifier systems used only by this script. The contract doesn't name them. Other repos should look resources up by the contract systems (clinic, service, schedule).

## Environment

| Var | Required | Used for |
|---|---|---|
| `MEDPLUM_BASE_URL` | yes (not in dry run) | e.g. `https://api.medplum.example` |
| `MEDPLUM_CLIENT_ID` / `MEDPLUM_CLIENT_SECRET` | yes (not in dry run) | `client_credentials` → `POST /oauth2/token`. The client must be a project admin, because it writes AccessPolicy and Subscription. |
| `CONNECT_PUBLIC_BASE_URL`, `CONNECT_SUBSCRIPTION_TOKEN` | only with `--with-connect-subscription` | endpoint `{base}/api/v1/fhir/subscription/medplum/{token}`. The token falls back to the secret, as Connect's does. |
| `MEDPLUM_WEBHOOK_SECRET` | required with `--with-connect-subscription` | HMAC secret for the Connect subscription (`X-Signature`). Must equal Connect's `MEDPLUM_WEBHOOK_SECRET`. |
| `BACKEND_PUBLIC_URL` | for the backend subscription | endpoint `{url}/api/integrations/medplum/appointments` |
| `BACKEND_MEDPLUM_WEBHOOK_SECRET` | strongly recommended | HMAC secret for the backend subscription |

The backend subscription is skipped, and the script says so, when `BACKEND_PUBLIC_URL` is missing. The summary flags `(NO SECRET!)` when a subscription was written without a secret.

## Running

```bash
cd caredevi/booking-pilot

# 1. Always dry-run first: prints every request and full FHIR body, makes no network calls.
#    Secrets and the Connect token are masked in the printout.
node provision.mjs --dry-run

# 2. Unit tests
node --test provision.test.mjs

# 3. Real run
export MEDPLUM_BASE_URL=... MEDPLUM_CLIENT_ID=... MEDPLUM_CLIENT_SECRET=...
export CONNECT_PUBLIC_BASE_URL=... CONNECT_SUBSCRIPTION_TOKEN=... MEDPLUM_WEBHOOK_SECRET=...
export BACKEND_PUBLIC_URL=... BACKEND_MEDPLUM_WEBHOOK_SECRET=...
node provision.mjs                       # default --config clinics/precision-dpc.json
node provision.mjs --skip-subscriptions  # clinic data only
node provision.mjs --with-connect-subscription  # ONLY if Connect's own script is not used in this environment
node provision.mjs --config clinics/other-clinic.json
```

The script ends with a summary of the ids for Organization, Location, Practitioners, HealthcareServices, Schedules, the Questionnaire url and id, the AccessPolicy and the Subscriptions, followed by the manual steps below.

## One Connect subscription per environment

Connect provisions its own Appointment Subscription with
`caredevi-connect/scripts/configure_medplum_subscriptions.py`
(`app/services/medplum/subscription_config.py`, spec key `appointment-status`):

- criteria `Appointment?status=pending,booked,cancelled`
- endpoint `{CONNECT_PUBLIC_BASE_URL}/api/v1/fhir/subscription/medplum/{token}`
- tag `https://caredevi.com/subscription|appointment-status`
- the `subscription-secret`, `subscription-max-attempts`=5 and `subscription-supported-interaction` create/update extensions

**Only one Connect subscription may exist per environment.** Two subscriptions to the same listener would deliver every event twice. That's why `provision.mjs` does **not** write a Connect subscription by default.

Use `--with-connect-subscription` only in an environment where Connect's script is not run. With the flag, the script writes a body identical to Connect's: same tag, criteria, reason, endpoint and extensions, with the token falling back to the secret. The conditional PUT on that tag then updates the same Subscription resource, so re-running either tool converges on one resource and they don't fight. A unit test pins the body to Connect's `build_subscription` output. If Connect changes its spec, update `buildSubscription('connect')` to match.

The backend subscription (`booking-pilot-backend`) always belongs to `provision.mjs`.

## Clinic hours come from the Schedule only

Connect does **not** apply its `MEETING_WORK_START/END` to app bookings: `$find`/`$hold` already enforce the Schedule provisioned here, so the Schedule is the single source of truth for clinic hours. (Those Connect env vars only affect Connect's legacy `/meetings` flow.) Change hours in `clinics/<slug>.json` and re-run this script; no Connect deploy is needed. `MEETING_TIMEZONE` only sets the display timezone of the calendar event.

## REQUIRED manual steps (the script does not do these)

1. **Make the backend's ClientApplication a project admin.** In the Medplum app, open Project → Clients → *backend client* → its ProjectMembership, and set `admin: true`. `x-medplum-on-behalf-of` is rejected with 403 otherwise (`packages/server/src/oauth/utils.ts:1380`).
2. **Give each booking Patient a ProjectMembership with the policy.** On-behalf-of resolves `ProjectMembership?profile=Patient/<id>&project=<project>` and 403s if there isn't one (`oauth/utils.ts:1399-1408`). The backend must create, or invite with `sendEmail: false`, a membership with `profile = Patient/<id>` and `accessPolicy = AccessPolicy/<printed id>`.
3. **Give Connect its own ClientApplication, and run Connect's subscription script once per environment** (see above). Don't share the backend's. It needs Appointment read/update, `$confirm`/`$cancel`, Slot read/update, and HealthcareService and Organization read. It never reads Patient. Project admin is the simplest option for the pilot.
4. **Record the ids in the backend env:**
   - `MEDPLUM_PATIENT_ACCESS_POLICY_ID=<AccessPolicy id>`
   - optionally pin `MEDPLUM_PDPC_ORGANIZATION_ID`, `MEDPLUM_PDPC_SERVICE_ID` and `MEDPLUM_PDPC_SCHEDULE_ID`. The backend can also resolve them by the identifier systems above.
5. **Webhook secrets.** Connect and the backend verify `X-Signature` = hex HMAC-SHA256(raw body, secret), using the same values passed here.
6. **Features.** The scheduling ops (`$find/$hold/$confirm/$cancel`) are plain routes with no project feature flag (`packages/server/src/fhir/routes.ts:436-442`). Bots are not used. On self-hosted Medplum, make sure the subscription worker/Redis is running and that the server can reach the Connect and backend URLs. Outbound rest-hooks to private IPs may be blocked.

### Smoke test

```bash
TOKEN=$(curl -s -X POST "$MEDPLUM_BASE_URL/oauth2/token" \
  -d grant_type=client_credentials -d client_id="$MEDPLUM_CLIENT_ID" -d client_secret="$MEDPLUM_CLIENT_SECRET" | jq -r .access_token)

curl -s -H "Authorization: Bearer $TOKEN" -G "$MEDPLUM_BASE_URL/fhir/R4/Appointment/\$find" \
  --data-urlencode "start=2026-11-16T00:00:00-06:00" \
  --data-urlencode "end=2026-11-21T00:00:00-06:00" \
  --data-urlencode "service-type-reference=HealthcareService/<HealthcareService id>" \
  --data-urlencode "schedule=Schedule/<Schedule id>" | jq '.parameter[0].resource.entry[:3][].resource | {start,end,status}'
# Expect 30-minute proposals Mon–Fri 09:00–16:30 America/Chicago (15:00Z–22:30Z in CST).
# The search range may not exceed 31 days (find.ts:91-95).
```

To test as a patient, add `-H "x-medplum-on-behalf-of: Patient/<id>"` (backend admin client). This exercises the AccessPolicy.

## How `$find` reads the provisioned data, with source references

Paths are relative to `packages/server/src/fhir/operations/` unless prefixed. Line numbers are for this fork (5.2.17). Each rule was also checked against the 5.1.37 release commit (`82e609ca1`), which is what the sandbox runs.

- **Required inputs.** `$find` takes `start`, `end`, `service-type-reference` (HealthcareService) and `schedule` (find.ts:55-58).
- **Schedule must have exactly one actor.** `getSchedulingParametersGroup` throws *"Scheduling only supported on schedules with exactly one actor"* (utils/scheduling.ts:593-597; the 5.1.37 code has the same check). That is why the Schedule actor is `[Practitioner]` and **not** `[Practitioner, HealthcareService, Location]` as the contract text says. The HealthcareService link goes in `serviceType`, and the Location is reachable via `HealthcareService.location` and PractitionerRole. The actor must also be readable by the caller (5.1.37 `assertAllLoaded(actors)`), which is why the patient policy can read Practitioner.
- **Schedule must offer the service.** `serviceTypeOffersService(schedule.serviceType, healthcareService)` (find.ts:169) checks for a `Schedule.serviceType` concept with extension `https://medplum.com/fhir/service-type-reference` → `HealthcareService/<id>` (`packages/core/src/scheduling.ts` `serviceTypeIncludesService`; the 5.1.37 check uses `serviceTypeIncludesService`). The concept also carries the coding `https://caredevi.com/service|<slug>`, so `Schedule?service-type=https://caredevi.com/service|<slug>` finds the schedules for a service.
- **HealthcareService SchedulingParameters.** Read by `getHealthcareServiceSchedulingParameters` (utils/scheduling-parameters.ts). The `service` and `availability` sub-extensions are forbidden there (`exactlyZero`, :415, :418), so the service carries only `duration` (30 min), `alignmentInterval` (30 min), `timezone` and `alignmentTimezone` (America/Chicago). Durations use `{value, unit: 'min'}`, the unit `schedulingDurationToMinutes` reads. Native `availableTime` (Mon–Fri 09–17) is also set; it is the fallback layer.
- **Schedule SchedulingParameters are per service.** `getScheduleSchedulingParameters` only uses the Schedule's SchedulingParameters extensions whose `service` sub-extension references the requested HealthcareService (:456-459). Without it, the schedule-level availability is silently ignored. Availability is the R5 Availability datatype in R4 extension form: `availability` → `availableTime[]` → repeated `daysOfWeek` (valueCode) + `availableStartTime` / `availableEndTime` (valueTime `HH:MM:SS`) (`extractAvailabilityR4`, :247; same shape in `find.test.ts:51-136`).
- **Timezone is mandatory.** Resolution order: the Schedule's `timezone` sub-extension, then the HealthcareService's, then the actor's HL7 `http://hl7.org/fhir/StructureDefinition/timezone` extension (prepended lowest-priority layer, utils/scheduling.ts:613-619). If none is found it throws *"No timezone specified"* (:624-630). The script sets all three. Availability windows are evaluated as wall-clock times in that zone (`resolveAvailability(..., timezone)`, find.ts:217).
- **Alignment.** `alignmentTimezone` defaults to `Etc/UTC` (scheduling-parameters.ts:137). It is set to the clinic zone so the 30-minute grid anchors at local midnight.
- **`duration` is required** somewhere in the stack, or `$find` errors (:469, :525). It is provided on the HealthcareService.

### `$hold` / `$cancel` and the AccessPolicy

`$hold` runs as the caller. It searches every Slot on the schedule (utils/scheduling.ts:667) and creates the Slots plus the Appointment in a transaction (utils/scheduling.ts ~1104-1106). `$cancel` **deletes** the appointment's Slots (cancel.ts:62, same in 5.1.37). Policy **"CareDevi Patient"** (`AccessPolicy.resource[].interaction`, present in 5.1.37 fhirtypes):

| Resource | Access |
|---|---|
| Organization, Location, Practitioner, PractitionerRole, HealthcareService, Schedule, Questionnaire | read / vread / search / history |
| Slot | read / vread / search / **create / update / delete** (required by `$hold` and `$cancel`; Slots carry no PHI) |
| Patient | `Patient?_id=%patient.id`: read / search / history / update. `identifier`, `link` and `managingOrganization` are read-only. |
| Appointment | `Appointment?patient=%patient`: read / search / history / create / update |
| QuestionnaireResponse | `QuestionnaireResponse?subject=%patient`: read / search / history / create / update |

`%patient` / `%patient.id` are replaced with the membership profile (`packages/server/src/fhir/accesspolicy.ts:298-311`). The policy has no top-level `compartment`. That field would stamp the Patient as `meta.account` on everything the patient creates, including Slots (`repo.ts:2288`). Because of the Appointment criteria, **the backend must add the Patient as a participant** of the `$find` proposal before calling `$hold`; `$find` proposals only list the schedule actors. Otherwise the create is rejected.

### Subscriptions

- Secret extension URL: **`https://www.medplum.com/fhir/StructureDefinition/subscription-secret`**, with `www.`. That is what the worker reads (`packages/server/src/workers/subscription.ts:911-915`, same in 5.1.37). The `medplum.com/...` URL without `www.`, given in the task brief, is **not** read, so no `X-Signature` would be sent.
- `subscription-supported-interaction` = `create` and `update` (`packages/core/src/subscriptions/index.ts:759-778`). Delete events are excluded.
- Criteria: the backend uses `Appointment?status=booked,cancelled`. Connect's own subscription uses `Appointment?status=pending,booked,cancelled`; its handler acts only on pending pilot bookings. The backend subscription fires on *every* update while the Appointment is booked; for example, Connect writing `meeting-url` after `$confirm` fires it a second time. The backend must dedupe per appointment+status, as the contract already requires.

## Clinic config shape (`clinics/*.json`)

`timezone`; `clinic` (slug, name, alias, phone, email, website, address, `content` = ClinicContent §1.1); `location` (slug, name, phone, position, hoursOfOperation); `practitioners[]`; `services[]` (slug, name, comment, extraDetails, durationMinutes, alignmentIntervalMinutes, buffer*Minutes, intakeQuestionnaire, `bookingConfig` = ServiceBookingConfig §1.2); `schedules[]` (slug, practitioner slug, service slugs, availability windows); `questionnaire` (url, name, title, item[]).

PDPC `content` also keeps some extra keys that aren't in §1.1 (`services`, `featureChips`, `membershipBenefits`, `included`, `startingPrice`), so no copy from the old screens is lost. Consumers ignore unknown keys.

## Calendar invites (clinic notifications)

Connect creates the Google Calendar event for each confirmed pilot booking. The
event is **PHI-free** — title `<visit> · <format> · via CareDevi`, description
with visit type, clinic, format, duration and a CareDevi reference; never the
patient's name, contact details or reason for visit.

Who gets emailed is configured **per visit type** in the HealthcareService
booking-config JSON (`services[].bookingConfig.notifyEmails` in the clinic
file):

```json
"notifyEmails": ["frontdesk@precisiondpc.com"]
```

- Listed addresses are invited to the event; Google emails them the invitation,
  any update, and the cancellation when the visit is cancelled.
- Empty / absent → the event is created on the clinic calendar silently.
- Patients are **not** invited from the clinic calendar (that would put patient
  emails on the Workspace calendar); patient communication is the app push.
