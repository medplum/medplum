# Appointment $confirm

:::info[Beta]

The `$confirm` operation is currently in [beta](/docs/compliance/alpha-beta).

:::

The `$confirm` operation confirms a held [`Appointment`](/docs/api/fhir/resources/appointment) by atomically setting its status to `booked` and upgrading all `busy-tentative` [`Slot`](/docs/api/fhir/resources/slot) resources it references to `busy` in a single FHIR transaction.

## Booking Lifecycle

`$confirm` is the final step in a hold-then-book flow:

1. **[`$find`](/docs/scheduling/appointment-find)** — Query available time slots
2. **[`$hold`](/docs/scheduling/appointment-hold)** — Reserve a slot. Creates a `pending` Appointment and `busy-tentative` Slots
3. **`$confirm`** — Confirm the hold. Transitions the Appointment to `booked` and Slots to `busy`

## Use Cases

- **Patient initiated booking**: A patient can self-schedule a "pending" appointment; staff confirms when accepting it
- **Staff approval workflow**: A coordinator places a hold on behalf of a patient; a clinician or admin confirms
- **Automated confirmation**: Programmatically confirm a hold after an external step (e.g., payment or consent) completes

## Invoke the `$confirm` operation

```
[base]/R4/Appointment/:id/$confirm
```

import Tabs from '@theme/Tabs';
import TabItem from '@theme/TabItem';

<Tabs>
<TabItem value="ts" label="TypeScript">

```typescript
import { MedplumClient } from '@medplum/core';
import type { Bundle } from '@medplum/fhirtypes';

const medplum = new MedplumClient();

const bundle = await medplum.post<Bundle>(
  medplum.fhirUrl('Appointment', 'my-appointment-id', '$confirm')
);
```

</TabItem>
<TabItem value="curl" label="cURL">

```bash
curl -X POST 'https://api.medplum.com/fhir/R4/Appointment/my-appointment-id/$confirm' \
  -H "Authorization: Bearer MY_ACCESS_TOKEN"
```

</TabItem>
</Tabs>

## Parameters

This operation takes no input parameters. The appointment to confirm is identified by the `id` in the URL.

### Constraints

- The Appointment must have `status: pending` or `status: proposed`. All other statuses are rejected with HTTP 409 Conflict.
- All `Slot` resources referenced by `Appointment.slot` must exist and be readable by the caller.

## Output

Returns `200 OK` with a `Bundle` of all updated resources:

- One [`Appointment`](/docs/api/fhir/resources/appointment) with `status: booked`
- One [`Slot`](/docs/api/fhir/resources/slot) per referenced slot that was `busy-tentative` (now `busy`). Slots already in `busy` status are returned unchanged.

### Example Response

```json
{
  "resourceType": "Bundle",
  "type": "transaction-response",
  "entry": [
    {
      "resource": {
        "resourceType": "Appointment",
        "id": "my-appointment-id",
        "status": "booked",
        "start": "2026-03-10T09:00:00.000Z",
        "end": "2026-03-10T10:00:00.000Z",
        "participant": [
          { "actor": { "reference": "Practitioner/dr-smith" }, "status": "tentative" },
          { "actor": { "reference": "Patient/my-patient-id" }, "status": "accepted" }
        ],
        "slot": [{ "reference": "Slot/my-slot-id" }]
      }
    },
    {
      "resource": {
        "resourceType": "Slot",
        "id": "my-slot-id",
        "status": "busy",
        "start": "2026-03-10T09:00:00.000Z",
        "end": "2026-03-10T10:00:00.000Z",
        "schedule": { "reference": "Schedule/dr-smith-schedule" }
      }
    }
  ]
}
```

## Confirmation Logic

`$confirm` performs the following steps atomically inside a database transaction, ensuring safety when concurrent scheduling requests are received.

1. Reads the Appointment identified by the URL `id`
2. Validates that the Appointment's `status` is `pending` or `proposed`
3. Loads all `Slot` resources listed in `Appointment.slot`
4. Updates any `busy-tentative` Slots to `busy`
5. Sets the Appointment's `status` to `booked` and saves it
6. Returns the updated Appointment and Slots in a Bundle

## Error Responses

### Appointment Not Found

```json
{
  "resourceType": "OperationOutcome",
  "issue": [{ "severity": "error", "code": "not-found", "details": { "text": "Not found" } }]
}
```

HTTP status: `404`

### Appointment Not in Confirmable State

```json
{
  "resourceType": "OperationOutcome",
  "issue": [{ "severity": "error", "code": "conflict", "details": { "text": "Appointment cannot be confirmed in 'booked' status" } }]
}
```

HTTP status: `409`

### Referenced Slot Not Found

```json
{
  "resourceType": "OperationOutcome",
  "issue": [{ "severity": "error", "code": "invalid", "details": { "text": "Loading slots failed" } }]
}
```

HTTP status: `400`

## Related

- [Appointment `$hold`](/docs/scheduling/appointment-hold) - Place a hold on a slot (the preceding step)
- [Appointment `$cancel`](/docs/scheduling/appointment-cancel) - Cancel an Appointment
- [Appointment `$find`](/docs/scheduling/appointment-find) - Find available slots
- [Scheduling Overview](/docs/scheduling) - High-level scheduling concepts
- [`Appointment` resource](/docs/api/fhir/resources/appointment)
- [`Slot` resource](/docs/api/fhir/resources/slot)
