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

The appointment to confirm is identified by the `id` in the URL.

| Name          | Type   | Description                                                                                                                                                                      | Required |
| ------------- | ------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------- |
| `occurrences` | `code` | For an occurrence of a recurring series, which occurrences to confirm: `this` (the default), `this-and-following`, or `all`. See [Confirming a recurring series](#confirming-a-recurring-series). | No       |

### Constraints

- The Appointment must have `status: pending` or `status: proposed`. All other statuses are rejected with HTTP 400 Bad Request.
- All `Slot` resources referenced by `Appointment.slot` must exist and be readable by the caller.
- `occurrences`, when sent, must be `this`, `this-and-following`, or `all`.

## Output

Returns `200 OK` with a `Bundle` of all updated resources:

- One [`Appointment`](/docs/api/fhir/resources/appointment) with `status: booked`
- One [`Slot`](/docs/api/fhir/resources/slot) per referenced slot that was `busy-tentative` (now `busy`). Slots already in `busy` status are returned unchanged.

When confirming several occurrences of a [recurring series](#confirming-a-recurring-series), the Bundle holds each booked Appointment followed by its Slots, in order of `start`.

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

## Confirming a recurring series

An Appointment held as part of a [recurring series](/docs/scheduling/appointment-hold#holding-a-recurring-series)
carries the series identifier that every occurrence shares. By default `$confirm` confirms only the
Appointment in the URL. The `occurrences` parameter confirms more of its series in the same call:

| `occurrences`        | Confirms                                                                    |
| -------------------- | --------------------------------------------------------------------------- |
| `this`               | Only this Appointment (the default)                                         |
| `this-and-following` | This Appointment and the occurrences of its series that start at or after it |
| `all`                | Every occurrence of its series                                              |

```bash
curl -X POST 'https://api.medplum.com/fhir/R4/Appointment/my-appointment-id/$confirm' \
  -H "Content-Type: application/fhir+json" \
  -H "Authorization: Bearer MY_ACCESS_TOKEN" \
  -d '{
    "resourceType": "Parameters",
    "parameter": [{ "name": "occurrences", "valueCode": "all" }]
  }'
```

- Only occurrences that are `pending` or `proposed` are confirmed; others, such as ones already
  confirmed or cancelled, are left as they are. The Appointment in the URL must itself be
  confirmable, as without `occurrences`.
- Which occurrences follow this one is decided by their `start`, not their `recurrenceId`. An
  Appointment without a `start` can't be confirmed with `this-and-following`.
- Every occurrence is confirmed in one transaction, all or none: if any of them fails a check below,
  none is confirmed.
- `occurrences` other than `this` is refused for an Appointment outside a series. Check for the
  series identifier before offering to confirm more than one occurrence.

## Confirmation Logic

`$confirm` performs the following steps atomically inside a database transaction, ensuring safety when concurrent scheduling requests are received.

1. Reads the Appointment identified by the URL `id`
2. Validates that the Appointment's `status` is `pending` or `proposed`
3. Loads any `HealthcareService` referenced by `Appointment.serviceType` and validates that it is not inactive
4. Loads all `Slot` resources listed in `Appointment.slot`
5. Updates any `busy-tentative` Slots to `busy`
6. Sets the Appointment's `status` to `booked` and saves it
7. Returns the updated Appointment and Slots in a Bundle

When confirming several occurrences of a [recurring series](#confirming-a-recurring-series), step 2 runs for the Appointment in the URL. Its series is then searched for the `pending` and `proposed` occurrences to confirm, and steps 3–6 run for each of them in order of `start`, in the same transaction.

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

### HealthcareService Inactive

A `HealthcareService` with `active: false` cannot be scheduled against. Appointments already booked for the service can still be canceled.

```json
{
  "resourceType": "OperationOutcome",
  "issue": [{ "severity": "error", "code": "invalid", "details": { "text": "HealthcareService is inactive" } }]
}
```

HTTP status: `400`

### Referenced HealthcareService Not Found

Returned when a `HealthcareService` referenced by `Appointment.serviceType` has been deleted, or is not readable by the caller's access policy.

```json
{
  "resourceType": "OperationOutcome",
  "issue": [{ "severity": "error", "code": "invalid", "details": { "text": "Loading HealthcareService failed" } }]
}
```

HTTP status: `400`

### Unknown `occurrences`

```json
{
  "resourceType": "OperationOutcome",
  "issue": [{ "severity": "error", "code": "invalid", "details": { "text": "occurrences must be one of this, this-and-following, all" }, "expression": ["Parameters.occurrences"] }]
}
```

HTTP status: `400`

### Not Part of a Recurring Series

Returned for `occurrences` other than `this` when the Appointment has no series identifier.

```json
{
  "resourceType": "OperationOutcome",
  "issue": [{ "severity": "error", "code": "invalid", "details": { "text": "Appointment is not part of a recurring series" }, "expression": ["Parameters.occurrences"] }]
}
```

HTTP status: `400`

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
