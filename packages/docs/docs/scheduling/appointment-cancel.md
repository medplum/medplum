# Appointment $cancel

:::info[Alpha]

The `$cancel` operation is currently in alpha.

:::

The `$cancel` operation cancels an [`Appointment`](/docs/api/fhir/resources/appointment) by atomically setting its status to `cancelled` and deleting all [`Slot`](/docs/api/fhir/resources/slot) resources it references in a single FHIR transaction.

## Use Cases

- **Patient-initiated cancellation**: Cancel a scheduled appointment at the patient's request and free the provider's time
- **Staff-initiated cancellation**: Cancel an appointment from an admin or scheduling workflow
- **Automated cancellation**: Programmatically cancel appointments based on external triggers (e.g., provider unavailability, EHR integration)

## Invoke the `$cancel` operation

```
[base]/R4/Appointment/$cancel
```

import Tabs from '@theme/Tabs';
import TabItem from '@theme/TabItem';

<Tabs>
<TabItem value="ts" label="TypeScript">

```typescript
import { MedplumClient } from '@medplum/core';
import type { Appointment, Bundle, Parameters } from '@medplum/fhirtypes';

const medplum = new MedplumClient();

const result = await medplum.post(
  medplum.fhirUrl('Appointment', '$cancel'),
  {
    resourceType: 'Parameters',
    parameter: [
      {
        name: 'appointment-reference',
        valueReference: { reference: 'Appointment/my-appointment-id' },
      },
    ],
  }
) as Parameters;

const bundle = result.parameter?.[0]?.resource as Bundle;
const appointment = bundle.entry
  ?.find((e) => e.resource?.resourceType === 'Appointment')
  ?.resource as Appointment;
```

</TabItem>
<TabItem value="curl" label="cURL">

```bash
curl -X POST 'https://api.medplum.com/fhir/R4/Appointment/$cancel' \
  -H "Content-Type: application/fhir+json" \
  -H "Authorization: Bearer MY_ACCESS_TOKEN" \
  -d '{
    "resourceType": "Parameters",
    "parameter": [
      {
        "name": "appointment-reference",
        "valueReference": { "reference": "Appointment/my-appointment-id" }
      }
    ]
  }'
```

</TabItem>
</Tabs>

## Parameters

| Name                     | Type        | Description                                                                                    | Required |
| ------------------------ | ----------- | ---------------------------------------------------------------------------------------------- | -------- |
| `appointment-reference`  | `Reference` | Reference to the [`Appointment`](/docs/api/fhir/resources/appointment) to cancel               | Yes      |

### Constraints

- The Appointment must have `status: booked` or `status: pending`. All other statuses are rejected.
- All `Slot` resources referenced by `Appointment.slot` must exist and be readable by the caller.

## Output

Returns `200 OK` with a [`Parameters`](/docs/api/fhir/resources/parameters) resource wrapping a `Bundle` containing the updated Appointment:

- One [`Appointment`](/docs/api/fhir/resources/appointment) with `status: cancelled`

All `Slot` resources that were referenced by the Appointment are deleted and do not appear in the response.

### Example Response

```json
{
  "resourceType": "Parameters",
  "parameter": [
    {
      "name": "return",
      "resource": {
        "resourceType": "Bundle",
        "type": "transaction-response",
        "entry": [
          {
            "resource": {
              "resourceType": "Appointment",
              "id": "my-appointment-id",
              "status": "cancelled",
              "start": "2026-03-10T09:00:00.000Z",
              "end": "2026-03-10T10:00:00.000Z",
              "participant": [
                { "actor": { "reference": "Practitioner/dr-smith" }, "status": "tentative" },
                { "actor": { "reference": "Patient/my-patient-id" }, "status": "accepted" }
              ]
            }
          }
        ]
      }
    }
  ]
}
```

## Cancellation Logic

`$cancel` performs the following steps inside a serializable transaction:

1. Reads the referenced Appointment
2. Loads all `Slot` resources listed in `Appointment.slot`
3. Validates that the Appointment's `status` is `booked` or `pending`
4. Sets the Appointment's `status` to `cancelled` and saves it
5. Deletes all referenced Slots
6. Returns the updated Appointment in the response Bundle

The transaction uses serializable isolation for safety when there are concurrent scheduling operations affecting the same appointment.

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
  "issue": [{ "severity": "error", "code": "invalid", "details": { "text": "Appointment is not in cancelable state due to status" } }]
}
```

### Referenced Slot Not Found

```json
{
  "resourceType": "OperationOutcome",
  "issue": [{ "severity": "error", "code": "invalid", "details": { "text": "Loading slots failed" } }]
}
```

### Missing Required Parameter

```json
{
  "resourceType": "OperationOutcome",
  "issue": [{ "severity": "error", "code": "invalid", "details": { "text": "Expected at least 1 value(s) for required input parameter 'appointment-reference'" } }]
}
```

## Related

- [Appointment `$book`](/docs/scheduling/appointment-book) - Book an Appointment (the inverse operation)
- [Appointment `$find`](/docs/scheduling/appointment-find) - Find available slots
- [Scheduling Overview](/docs/scheduling) - High-level scheduling concepts
- [`Appointment` resource](/docs/api/fhir/resources/appointment)
- [`Slot` resource](/docs/api/fhir/resources/slot)
