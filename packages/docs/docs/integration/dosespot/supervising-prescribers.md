---
sidebar_position: 5
description: Set or remove a supervising prescriber after DoseSpot enrollment, and see the relationship on both Practitioner resources.
---

# Supervising Prescribers

Some prescribing workflows require a clinician—such as a nurse practitioner or physician assistant—to prescribe on behalf of a supervising clinician. After both clinicians are [enrolled in DoseSpot](./enroll-user), you can set that relationship without enrolling either clinician again.

For example, when a newly enrolled nurse practitioner needs to prescribe under a medical director, assign the nurse practitioner as the supervisee and the medical director as the supervisor. If the medical director changes, assign the replacement; to end the relationship entirely, remove it.

:::tip[When to use this operation]
Use this operation when you need to:

- Complete setup for a newly enrolled clinician who requires supervision
- Change a clinician's supervising prescriber
- Remove a relationship that is no longer valid
:::

Use this endpoint to add or remove the relationship:

```text
POST /fhir/R4/Practitioner/$dosespot-set-supervising-prescriber
```

The request identifies the supervisee and supervisor by their Medplum Practitioner IDs and optionally specifies whether to add or remove the relationship. The relationship is set in DoseSpot for your configured clinic and recorded on both Practitioner resources in Medplum.

:::note[Prerequisites]
Before calling the operation:

1. Restrict access to a trusted administrative caller with permission to invoke this operation and to update `Practitioner` resources. The Medplum caller does not need to be enrolled in DoseSpot.
2. Enroll both Practitioners in DoseSpot. Each must have a DoseSpot clinician ID on their `ProjectMembership`.
:::

## Workflow

1. Enroll the supervisor and the supervisee in DoseSpot.
2. Call the operation to set the supervisor for `DOSESPOT_CLINIC_ID`.
3. To end the relationship for that clinic, call the operation again with `action: "remove"`.

## Relationship on the Practitioner resources

After DoseSpot accepts the change, the operation records the relationship on the Practitioners so your application can read it without calling DoseSpot:

- The supervisee has one extension with URL `https://dosespot.com/supervising-prescriber` and a `valueReference` to the supervisor `Practitioner`.
- The supervisor has one extension with URL `https://dosespot.com/supervisee` and a `valueReference` to a supervisee `Practitioner` for each supervisee, so a supervisor with several supervisees has several of these extensions.

For example, a supervisee supervised by a medical director looks like this:

```json
{
  "resourceType": "Practitioner",
  "id": "supervisee-practitioner-id",
  "extension": [
    {
      "url": "https://dosespot.com/supervising-prescriber",
      "valueReference": { "reference": "Practitioner/supervisor-practitioner-id" }
    }
  ]
}
```

The extensions are updated each time you add or remove a relationship. Adding the same relationship again does not create duplicates, and assigning a new supervisor removes the supervisee from the previous supervisor's list. Relationships that were set before this behavior was available are recorded the next time you run the add operation for them.

If DoseSpot accepts the change but the Practitioner update fails, the operation returns an error that says so. Run the same request again to repair the extensions.

## Operation Input Parameters

| Parameter | Required | Type | Description |
| --- | --- | --- | --- |
| `practitionerId` | Yes | `id` | The Medplum Practitioner ID of the supervisee |
| `supervisorPractitionerId` | On `add` | `id` | The Medplum Practitioner ID of the supervisor. Optional on `remove`; the operation uses the supervisor recorded on the supervisee |
| `action` | No | `"add"` \| `"remove"` | `"add"` sets the supervisor (default). `"remove"` clears the supervisor relationship for the configured clinic |

Send these fields as a plain JSON object. Pass the bare IDs from the Medplum `Practitioner` resources, without a `Practitioner/` prefix. This operation does not accept a Patient ID. The response uses a FHIR `Parameters` resource, as described in [Operation Response](#operation-response).

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

Only `practitionerId` is needed to remove the relationship.

### Medplum CLI

```bash
medplum post -p <profile> 'Practitioner/$dosespot-set-supervising-prescriber' '{
  "practitionerId": "supervisee-practitioner-id",
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
    "action": "remove"
  }'
```

:::caution[Remove is clinic-scoped]
DoseSpot clears whichever supervisor currently exists for `DOSESPOT_CLINIC_ID`. If you also send `supervisorPractitionerId`, DoseSpot does not verify it when clearing the relationship, and the Practitioner extensions are cleared for the supervisor recorded on the supervisee.
:::

## Operation Response

The operation returns a FHIR `Parameters` resource. Each field below appears as a named entry in `Parameters.parameter`; primitive values use the corresponding FHIR `value[x]` property. The nested `result` parameter contains the raw DoseSpot result as `part` entries.

| Field | Type | Description |
| --- | --- | --- |
| `practitionerId` | `valueId` | The supervisee Practitioner ID |
| `supervisorPractitionerId` | `valueId` | The supervisor Practitioner ID, when there is one |
| `clinicianId` | `valueInteger` | The supervisee's DoseSpot clinician ID |
| `supervisorClinicianId` | `valueInteger` | The supervisor's DoseSpot clinician ID, when there is one |
| `clinicId` | `valueInteger` | The DoseSpot clinic the relationship was set or cleared on |
| `action` | `valueCode` | The action that was performed: `"add"` or `"remove"` |
| `result` | `part` | The raw DoseSpot `ResultCode` and `ResultDescription` |

On `remove`, the supervisor fields identify the supervisor supplied to the operation, or the one recorded on the supervisee. They do not confirm which supervisor relationship DoseSpot cleared.

## Troubleshooting

| Error | Cause | Resolution |
| --- | --- | --- |
| Missing `practitionerId` / `supervisorPractitionerId` | Required input omitted | Pass `practitionerId`, and `supervisorPractitionerId` when adding |
| `practitionerId` and `supervisorPractitionerId` must refer to different Practitioners | Same ID on both sides | Use two distinct Practitioners |
| Invalid action | `action` is not `"add"` or `"remove"` | Omit `action` (defaults to `"add"`) or pass one of those two values |
| No DoseSpot clinician ID | One or both Practitioners are not enrolled | Enroll both Practitioners before setting a supervising prescriber |
| No ProjectMembership found | Supervisee or supervisor has no membership | Create a `ProjectMembership` for that Practitioner, then enroll |
| DoseSpot authorization error | DoseSpot rejected the administrative identity Medplum uses for your project | Contact Medplum support |
| Invalid `DOSESPOT_CLINIC_ID` | Clinic secret is not a number | Set `DOSESPOT_CLINIC_ID` to the numeric DoseSpot clinic ID |
| Failed to add/remove supervising prescriber | DoseSpot returned a non-OK `ResultCode` | Use `ResultDescription` from the error to correct the clinic or clinician data |
| DoseSpot relationship was added/removed, but updating the Practitioner extensions failed | The caller cannot update `Practitioner` resources, or a Practitioner changed during the request | Check the caller's access, then run the same request again |
