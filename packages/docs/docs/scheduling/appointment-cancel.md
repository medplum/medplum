# Appointment $cancel

:::info[Beta]

The `$cancel` operation is currently in [beta](/docs/compliance/alpha-beta).

:::

The `$cancel` operation cancels an [`Appointment`](/docs/api/fhir/resources/appointment) by atomically setting its status to `cancelled` and deleting all [`Slot`](/docs/api/fhir/resources/slot) resources it references in a single FHIR transaction. An optional `cancelationReason` records why the Appointment was canceled.

## Use Cases

- **Patient-initiated cancellation**: Cancel a scheduled appointment at the patient's request and free the provider's time
- **Staff-initiated cancellation**: Cancel an appointment from an admin or scheduling workflow
- **Automated cancellation**: Programmatically cancel appointments based on external triggers (e.g., provider unavailability, EHR integration)

## Invoke the `$cancel` operation

```
[base]/R4/Appointment/:id/$cancel
```

import Tabs from '@theme/Tabs';
import TabItem from '@theme/TabItem';

<Tabs>
<TabItem value="ts" label="TypeScript">

```typescript
import { MedplumClient } from '@medplum/core';
import type { Appointment, Parameters } from '@medplum/fhirtypes';

const medplum = new MedplumClient();

const appointment = await medplum.post<Appointment>(
  medplum.fhirUrl('Appointment', 'my-appointment-id', '$cancel')
);

// Optionally, record why the Appointment was canceled
const appointmentWithReason = await medplum.post<Appointment>(
  medplum.fhirUrl('Appointment', 'my-appointment-id', '$cancel'),
  {
    resourceType: 'Parameters',
    parameter: [
      {
        name: 'cancelationReason',
        valueCodeableConcept: {
          coding: [
            {
              system: 'http://terminology.hl7.org/CodeSystem/appointment-cancellation-reason',
              code: 'pat-cpp',
              display: 'Patient: Canceled via Patient Portal',
            },
          ],
        },
      },
    ],
  } satisfies Parameters
);
```

</TabItem>
<TabItem value="curl" label="cURL">

```bash
curl -X POST 'https://api.medplum.com/fhir/R4/Appointment/my-appointment-id/$cancel' \
  -H "Authorization: Bearer MY_ACCESS_TOKEN"
```

Optionally, record why the Appointment was canceled:

```bash
curl -X POST 'https://api.medplum.com/fhir/R4/Appointment/my-appointment-id/$cancel' \
  -H "Authorization: Bearer MY_ACCESS_TOKEN" \
  -H "Content-Type: application/fhir+json" \
  -d '{
    "resourceType": "Parameters",
    "parameter": [
      {
        "name": "cancelationReason",
        "valueCodeableConcept": {
          "coding": [
            {
              "system": "http://terminology.hl7.org/CodeSystem/appointment-cancellation-reason",
              "code": "pat-cpp",
              "display": "Patient: Canceled via Patient Portal"
            }
          ]
        }
      }
    ]
  }'
```

</TabItem>
</Tabs>

## Parameters

The appointment to cancel is identified by the `id` in the URL.

| Name                | Type              | Description                                                                               | Required |
| ------------------- | ----------------- | ----------------------------------------------------------------------------------------- | -------- |
| `cancelationReason` | `CodeableConcept` | The coded reason the Appointment was canceled. Stored on `Appointment.cancelationReason`. | No       |

### Cancelation Reason

When `cancelationReason` is provided, it is written to [`Appointment.cancelationReason`](/docs/api/fhir/resources/appointment) on the canceled Appointment. When it is omitted, the field is left untouched.

:::note

FHIR R4 spells this element `cancelationReason`, with a single `l`. The operation parameter uses the same spelling as the resource element.

:::

FHIR recommends coding this with the [appointment-cancellation-reason](http://terminology.hl7.org/CodeSystem/appointment-cancellation-reason) CodeSystem, but any `CodeableConcept` is accepted.

```json
{
  "resourceType": "Parameters",
  "parameter": [
    {
      "name": "cancelationReason",
      "valueCodeableConcept": {
        "coding": [
          {
            "system": "http://terminology.hl7.org/CodeSystem/appointment-cancellation-reason",
            "code": "pat-cpp",
            "display": "Patient: Canceled via Patient Portal"
          }
        ]
      }
    }
  ]
}
```

### Constraints

- The Appointment must have `status: booked` or `status: pending`. All other statuses are rejected.
- All `Slot` resources referenced by `Appointment.slot` must exist and be readable by the caller.

## Output

Returns `200 OK` with the updated [`Appointment`](/docs/api/fhir/resources/appointment) resource directly:

- One [`Appointment`](/docs/api/fhir/resources/appointment) with `status: cancelled`, and `cancelationReason` set if it was provided

All `Slot` resources that were referenced by the Appointment are deleted and do not appear in the response.

### Example Response

```json
{
  "resourceType": "Appointment",
  "id": "my-appointment-id",
  "status": "cancelled",
  "cancelationReason": {
    "coding": [
      {
        "system": "http://terminology.hl7.org/CodeSystem/appointment-cancellation-reason",
        "code": "pat-cpp",
        "display": "Patient: Canceled via Patient Portal"
      }
    ]
  },
  "start": "2026-03-10T09:00:00.000Z",
  "end": "2026-03-10T10:00:00.000Z",
  "participant": [
    { "actor": { "reference": "Practitioner/dr-smith" }, "status": "tentative" },
    { "actor": { "reference": "Patient/my-patient-id" }, "status": "accepted" }
  ]
}
```

## Cancellation Logic

`$cancel` performs the following steps atomically inside a database transaction, ensuring safety when concurrent scheduling requests are received.

1. Reads the Appointment identified by the URL `id`
2. Loads all `Slot` resources listed in `Appointment.slot`
3. Validates that the Appointment's `status` is `booked` or `pending`
4. Sets the Appointment's `status` to `cancelled`, along with `cancelationReason` if one was provided, and saves it
5. Deletes all referenced Slots
6. Returns the updated Appointment

## Error Responses

### Appointment Not Found

```json
{
  "resourceType": "OperationOutcome",
  "issue": [{ "severity": "error", "code": "not-found", "details": { "text": "Not found" } }]
}
```

### Appointment Not in Cancelable State

```json
{
  "resourceType": "OperationOutcome",
  "issue": [{ "severity": "error", "code": "invalid", "details": { "text": "Appointment cannot be canceled in 'arrived' status" } }]
}
```

### Referenced Slot Not Found

```json
{
  "resourceType": "OperationOutcome",
  "issue": [{ "severity": "error", "code": "invalid", "details": { "text": "Loading slots failed" } }]
}
```

## Related

- [Appointment `$book`](/docs/scheduling/appointment-book) - Book an Appointment (the inverse operation)
- [Appointment `$find`](/docs/scheduling/appointment-find) - Find available slots
- [Scheduling Overview](/docs/scheduling) - High-level scheduling concepts
- [`Appointment` resource](/docs/api/fhir/resources/appointment)
- [`Slot` resource](/docs/api/fhir/resources/slot)
