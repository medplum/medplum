---
sidebar_position: 5
---

# Supervising Prescribers

DoseSpot models mid-level prescribers such as nurse practitioners and physician assistants as a **Prescribing Agent Clinician** (role `5`) who prescribes on behalf of a supervising **Prescribing Clinician** (role `1`). [Prescriber enrollment](./enroll-user) creates the clinicians but does not attach the supervisor.

Use `dosespot-set-supervising-prescriber-bot` after both clinicians are enrolled to add or remove this relationship for the project's configured DoseSpot clinic. This workflow does not apply to Proxy Clinicians (role `6`).

:::note[Prerequisites]
Before executing the bot:

1. Restrict access to a trusted administrative caller. The bot has `runAsUser: true`, so it inherits the caller's Medplum access, while authenticating to DoseSpot with the admin `DOSESPOT_USER_ID` secret.
2. Enroll both Practitioners in DoseSpot. Each must have a DoseSpot clinician ID on their `ProjectMembership`.
3. Verify that the supervisor is a Prescribing Clinician (role `1`) and the supervisee is a Prescribing Agent Clinician (role `5`). The bot does not independently validate role eligibility.
:::

## Workflow

1. Enroll the supervisor as a Prescribing Clinician (role `1`).
2. Enroll the supervisee as a Prescribing Agent Clinician (role `5`).
3. Run the bot to attach the supervisor for `DOSESPOT_CLINIC_ID`.
4. To clear the relationship for that clinic, run the bot again with `action: "remove"`.

The relationship is stored in DoseSpot. The bot does not create or update a FHIR resource representing the relationship in Medplum.

## Bot Input Parameters

| Parameter | Required | Type | Description |
| --- | --- | --- | --- |
| `practitionerId` | Yes | `string` | The FHIR Practitioner ID of the supervisee (the Prescribing Agent) |
| `supervisorPractitionerId` | Yes | `string` | The FHIR Practitioner ID of the supervisor. Required on both `add` and `remove`; the bot resolves this clinician even when removing |
| `action` | No | `"add"` \| `"remove"` | `"add"` sets the supervisor (default). `"remove"` clears the supervisor relationship for the configured clinic |

## Add a Supervisor

```typescript
const result = await medplum.executeBot(
  { system: 'https://www.medplum.com/bots', value: 'dosespot-set-supervising-prescriber-bot' },
  {
    practitionerId: 'supervisee-practitioner-id',
    supervisorPractitionerId: 'supervisor-practitioner-id',
  }
);
// result.clinicianId            - DoseSpot clinician ID of the supervisee
// result.supervisorClinicianId  - DoseSpot clinician ID of the supervisor
// result.clinicId               - clinic the relationship was set on
// result.action                 - "add"
```

```bash
curl 'https://api.medplum.com/fhir/R4/Bot/YOUR_BOT_ID/$execute' \
  -X POST \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $MY_ACCESS_TOKEN" \
  -d '{
    "practitionerId": "supervisee-practitioner-id",
    "supervisorPractitionerId": "supervisor-practitioner-id"
  }'
```

## Remove a Supervisor

```typescript
const result = await medplum.executeBot(
  { system: 'https://www.medplum.com/bots', value: 'dosespot-set-supervising-prescriber-bot' },
  {
    practitionerId: 'supervisee-practitioner-id',
    supervisorPractitionerId: 'supervisor-practitioner-id',
    action: 'remove',
  }
);
```

```bash
curl 'https://api.medplum.com/fhir/R4/Bot/YOUR_BOT_ID/$execute' \
  -X POST \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $MY_ACCESS_TOKEN" \
  -d '{
    "practitionerId": "supervisee-practitioner-id",
    "supervisorPractitionerId": "supervisor-practitioner-id",
    "action": "remove"
  }'
```

:::caution[Remove is clinic-scoped]
DoseSpot clears whichever supervisor currently exists for `DOSESPOT_CLINIC_ID`. `supervisorPractitionerId` is still required and must resolve to an enrolled clinician, but DoseSpot does not verify that identity when clearing the relationship.
:::

## Bot Response

| Field | Type | Description |
| --- | --- | --- |
| `practitionerId` | `string` | The supervisee Practitioner ID |
| `supervisorPractitionerId` | `string` | The supplied supervisor Practitioner ID |
| `clinicianId` | `number` | The supervisee's DoseSpot clinician ID |
| `supervisorClinicianId` | `number` | The supplied supervisor's DoseSpot clinician ID |
| `clinicId` | `number` | The DoseSpot clinic the relationship was set or cleared on |
| `action` | `"add"` \| `"remove"` | The action that was performed |
| `result` | `DoseSpotResultResponse` | The raw DoseSpot API result |

On `remove`, the supervisor fields identify the supervisor supplied to the bot. They do not confirm which supervisor relationship DoseSpot cleared.

## Troubleshooting

| Error | Cause | Resolution |
| --- | --- | --- |
| Missing `practitionerId` / `supervisorPractitionerId` | Required input omitted | Pass both Practitioner IDs |
| `practitionerId` and `supervisorPractitionerId` must refer to different Practitioners | Same ID on both sides | Use two distinct Practitioners |
| Invalid action | `action` is not `"add"` or `"remove"` | Omit `action` (defaults to `"add"`) or pass one of those two values |
| No DoseSpot clinician ID | One or both Practitioners are not enrolled | Enroll both Practitioners before setting a supervising prescriber |
| No ProjectMembership found | Supervisee or supervisor has no membership | Create a `ProjectMembership` for that Practitioner, then enroll |
| Invalid `DOSESPOT_CLINIC_ID` | Clinic secret is not a number | Set `DOSESPOT_CLINIC_ID` to the numeric DoseSpot clinic ID |
| Failed to add/remove supervising prescriber | DoseSpot returned a non-OK `ResultCode` | Use `ResultDescription` from the error to correct the clinic or clinician data |
