---
sidebar_label: Appointment $reschedule
sidebar_position: 6
---

import ExampleCode from '!!raw-loader!@site/../examples/src/scheduling/reschedule.ts';
import MedplumCodeBlock from '@site/src/components/MedplumCodeBlock';
import Tabs from '@theme/Tabs';
import TabItem from '@theme/TabItem';

# Appointment $reschedule

:::info[Beta]

The `$reschedule` operation is currently in [beta](/docs/compliance/alpha-beta).

:::

The `$reschedule` operation atomically cancels an existing [`Appointment`](/docs/api/fhir/resources/appointment) and books a new one in a single FHIR transaction. It is equivalent to calling [`$cancel`](/docs/scheduling/appointment-cancel) followed by [`$book`](/docs/scheduling/appointment-book), without the window where the original slots have been released but the new booking has not yet committed.

## Use Cases

- **Patient-initiated reschedule**: Move an existing appointment to a new time chosen from `$find` results
- **Staff-initiated reschedule**: Change an appointment from an admin or scheduling workflow
- **Avoiding double-booking races**: Keep cancel and book in one serializable transaction so another request cannot take the new slot, and so a failed booking does not leave the original appointment cancelled

## Invoke the `$reschedule` operation

```
[base]/R4/Appointment/:id/$reschedule
```

<Tabs>
<TabItem value="ts" label="TypeScript">
  <MedplumCodeBlock language="ts" selectBlocks="rescheduleOne">
    {ExampleCode}
  </MedplumCodeBlock>
</TabItem>
<TabItem value="curl" label="cURL">

```bash
curl -X POST 'https://api.medplum.com/fhir/R4/Appointment/my-appointment-id/$reschedule' \
  -H "Content-Type: application/fhir+json" \
  -H "Authorization: Bearer MY_ACCESS_TOKEN" \
  -d '{
    "resourceType": "Parameters",
    "parameter": [
      {
        "name": "appointment",
        "resource": {
          "resourceType": "Appointment",
          "status": "proposed",
          "start": "2026-03-11T09:00:00.000Z",
          "end": "2026-03-11T10:00:00.000Z",
          "serviceType": [
            {
              "coding": [{ "code": "initial-visit" }],
              "extension": [
                {
                  "url": "https://medplum.com/fhir/service-type-reference",
                  "valueReference": { "reference": "HealthcareService/my-healthcareservice-id" }
                }
              ]
            }
          ],
          "participant": [
            {
              "actor": { "reference": "Practitioner/dr-smith" },
              "required": "required",
              "status": "needs-action"
            }
          ],
          "contained": [
            {
              "resourceType": "Slot",
              "status": "busy",
              "schedule": { "reference": "Schedule/dr-smith-schedule" },
              "start": "2026-03-11T09:00:00.000Z",
              "end": "2026-03-11T10:00:00.000Z"
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

The appointment being replaced is identified by the `id` in the URL. The new time is supplied as a proposed `Appointment`, the same input [`$book`](/docs/scheduling/appointment-book) accepts.

| Name          | Type          | Description                                                                                                       | Required |
| ------------- | ------------- | ----------------------------------------------------------------------------------------------------------------- | -------- |
| `appointment` | `Appointment` | A proposed `Appointment` resource (e.g. from `$find`). Must include `start`, `end`, `serviceType`, and contained Slots. | Yes      |

### Constraints

- The existing Appointment must have `status: booked` or `status: pending`. All other statuses are rejected.
- All `Slot` resources referenced by the existing `Appointment.slot` must exist and be readable by the caller.
- The proposed `appointment` parameter must satisfy the same constraints as [`$book`](/docs/scheduling/appointment-book).

The easiest way to meet the input requirements is to use a result from a [`$find` operation](/docs/scheduling/appointment-find).

## Output

Returns `201 Created` with a [`Bundle`](/docs/api/fhir/resources/bundle) wrapping the newly persisted resources, identical to [`$book`](/docs/scheduling/appointment-book):

- One [`Appointment`](/docs/api/fhir/resources/appointment) with `status: "booked"` (a new resource, not an update of the original)
- One `Slot` per contained Slot with `status: "busy"`
- Zero or more buffer `Slot` resources with `status: "busy-unavailable"`

The original Appointment is updated to `status: cancelled` and its Slots are deleted. Those resources are not included in the response Bundle.

## Reschedule Logic

`$reschedule` performs the following steps atomically inside a database transaction:

1. Validates the proposed Appointment (contained Slots, service type, scheduling parameters)
2. Cancels the existing Appointment (`status: cancelled`) and deletes its Slots
3. Checks that the new time is available (the original Slots no longer block it)
4. Creates the new `Appointment`, busy `Slot`(s), and any buffer `Slot`(s)
5. Returns the created resources in the response Bundle

If the new time is not available, the entire transaction is rolled back and the original Appointment remains booked (or pending).

## Error Responses

### Appointment Not Found

```json
{
  "resourceType": "OperationOutcome",
  "issue": [{ "severity": "error", "code": "not-found", "details": { "text": "Not found" } }]
}
```

### Appointment Not in Reschedulable State

```json
{
  "resourceType": "OperationOutcome",
  "issue": [{ "severity": "error", "code": "invalid", "details": { "text": "Appointment cannot be canceled in 'fulfilled' status" } }]
}
```

### Time Not Available

```json
{
  "resourceType": "OperationOutcome",
  "issue": [{ "severity": "error", "code": "invalid", "details": { "text": "Requested time slot is not available" } }]
}
```

## Related

- [Appointment `$book`](/docs/scheduling/appointment-book) - Book an Appointment
- [Appointment `$cancel`](/docs/scheduling/appointment-cancel) - Cancel an Appointment
- [Appointment `$find`](/docs/scheduling/appointment-find) - Find available slots
- [Scheduling Overview](/docs/scheduling) - High-level scheduling concepts
- [`Appointment` resource](/docs/api/fhir/resources/appointment)
- [`Slot` resource](/docs/api/fhir/resources/slot)
