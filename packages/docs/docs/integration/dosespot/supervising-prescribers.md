---
sidebar_position: 5
description: Configure supervising prescribers after DoseSpot enrollment so prescribing agents can prescribe on behalf of an eligible supervising clinician.
---

# Supervising Prescribers

Some prescribing workflows require a clinician—such as a nurse practitioner or physician assistant—to prescribe on behalf of a supervising clinician. After both clinicians are [enrolled in DoseSpot](./enroll-user), you can configure that relationship without enrolling either clinician again.

For example, when a newly enrolled nurse practitioner needs to prescribe under a medical director, assign the nurse practitioner as the supervisee and the medical director as the supervisor. If the medical director changes, remove the existing relationship and assign the replacement.

:::tip[When to use this operation]
Use this operation when you need to:

- Complete setup for a newly enrolled clinician who requires supervision
- Change a clinician's supervising prescriber
- Remove a relationship that is no longer valid

You do not need this workflow for independent Prescribing Clinicians or Proxy Clinicians.
:::

DoseSpot represents the supervisee as a **Prescribing Agent Clinician** (role `5`) and the supervisor as a **Prescribing Clinician** (role `1`). The relationship tells DoseSpot which supervising clinician the prescribing agent acts on behalf of for the configured clinic.

Use this endpoint to add or remove the relationship:

```text
POST /fhir/R4/Practitioner/$dosespot-set-supervising-prescriber
```

The request identifies the supervisee and supervisor by their Medplum Practitioner IDs and optionally specifies whether to add or remove the relationship.

:::note[Prerequisites]
Before calling the operation:

1. Restrict access to a trusted administrative caller with permission to invoke this operation.
2. Enroll both Practitioners in DoseSpot. Each must have a DoseSpot clinician ID on their `ProjectMembership`.
3. Verify that the supervisor is a Prescribing Clinician (role `1`) and the supervisee is a Prescribing Agent Clinician (role `5`). The operation does not independently validate role eligibility.
:::

## Workflow

1. Enroll the supervisor as a Prescribing Clinician (role `1`).
2. Enroll the supervisee as a Prescribing Agent Clinician (role `5`).
3. Call the operation to attach the supervisor for `DOSESPOT_CLINIC_ID`.
4. To clear the relationship for that clinic, call the operation again with `action: "remove"`.

The relationship is stored in DoseSpot. The operation does not create or update a FHIR resource representing the relationship in Medplum.

## Operation Input Parameters

| Parameter | Required | Type | Description |
| --- | --- | --- | --- |
| `practitionerId` | Yes | `id` | The Medplum Practitioner ID of the supervisee (the Prescribing Agent) |
| `supervisorPractitionerId` | Yes | `id` | The Medplum Practitioner ID of the supervisor. Required on both `add` and `remove`; the operation resolves this clinician even when removing |
| `action` | No | `"add"` \| `"remove"` | `"add"` sets the supervisor (default). `"remove"` clears the supervisor relationship for the configured clinic |

Send these fields as a plain JSON object. Pass the bare IDs from the two Medplum `Practitioner` resources, without a `Practitioner/` prefix. This operation does not accept a Patient ID. The response uses a FHIR `Parameters` resource, as described in [Operation Response](#operation-response).

## Add a Supervisor

### Medplum CLI

The Medplum CLI supplies the FHIR base URL and authentication from the selected profile:

```bash
medplum post -p <profile> 'Practitioner/$dosespot-set-supervising-prescriber' '{
  "practitionerId": "supervisee-practitioner-id",
  "supervisorPractitionerId": "supervisor-practitioner-id"
}'
```

### TypeScript

```typescript
import type { Parameters } from '@medplum/fhirtypes';

const result = await medplum.post<Parameters>(
  medplum.fhirUrl('Practitioner', '$dosespot-set-supervising-prescriber'),
  {
    practitionerId: 'supervisee-practitioner-id',
    supervisorPractitionerId: 'supervisor-practitioner-id',
  }
);

// The response is a FHIR Parameters resource.
console.log(result.parameter);
```

### cURL

```bash
curl 'https://api.medplum.com/fhir/R4/Practitioner/$dosespot-set-supervising-prescriber' \
  -X POST \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $MY_ACCESS_TOKEN" \
  -d '{
    "practitionerId": "supervisee-practitioner-id",
    "supervisorPractitionerId": "supervisor-practitioner-id"
  }'
```

## Remove a Supervisor

### Medplum CLI

```bash
medplum post -p <profile> 'Practitioner/$dosespot-set-supervising-prescriber' '{
  "practitionerId": "supervisee-practitioner-id",
  "supervisorPractitionerId": "supervisor-practitioner-id",
  "action": "remove"
}'
```

### TypeScript

```typescript
import type { Parameters } from '@medplum/fhirtypes';

const result = await medplum.post<Parameters>(
  medplum.fhirUrl('Practitioner', '$dosespot-set-supervising-prescriber'),
  {
    practitionerId: 'supervisee-practitioner-id',
    supervisorPractitionerId: 'supervisor-practitioner-id',
    action: 'remove',
  }
);
```

### cURL

```bash
curl 'https://api.medplum.com/fhir/R4/Practitioner/$dosespot-set-supervising-prescriber' \
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

## Operation Response

The operation returns a FHIR `Parameters` resource. Each field below appears as a named entry in `Parameters.parameter`; primitive values use the corresponding FHIR `value[x]` property. The nested `result` parameter contains the raw DoseSpot result as `part` entries.

| Field | Type | Description |
| --- | --- | --- |
| `practitionerId` | `valueId` | The supervisee Practitioner ID |
| `supervisorPractitionerId` | `valueId` | The supplied supervisor Practitioner ID |
| `clinicianId` | `valueInteger` | The supervisee's DoseSpot clinician ID |
| `supervisorClinicianId` | `valueInteger` | The supplied supervisor's DoseSpot clinician ID |
| `clinicId` | `valueInteger` | The DoseSpot clinic the relationship was set or cleared on |
| `action` | `valueCode` | The action that was performed: `"add"` or `"remove"` |
| `result` | `part` | The raw DoseSpot `ResultCode` and `ResultDescription` |

On `remove`, the supervisor parameters identify the supervisor supplied to the operation. They do not confirm which supervisor relationship DoseSpot cleared.

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
