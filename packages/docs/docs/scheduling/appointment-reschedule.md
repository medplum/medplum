import ExampleCode from '!!raw-loader!@site/../examples/src/scheduling/reschedule.ts';
import MedplumCodeBlock from '@site/src/components/MedplumCodeBlock';
import Tabs from '@theme/Tabs';
import TabItem from '@theme/TabItem';

# Appointment $reschedule

:::info[Beta]

The `$reschedule` operation is currently in [beta](/docs/compliance/alpha-beta).

:::

The `$reschedule` operation moves an existing [`Appointment`](/docs/api/fhir/resources/appointment) to a new time, a new set of [`Schedule`](/docs/api/fhir/resources/schedule) resources, or both. In a single FHIR transaction it releases the [`Slot`](/docs/api/fhir/resources/slot) resources the appointment currently holds, validates that the new time is genuinely available, creates the new Slots, and updates the Appointment in place.

Because the old Slots are released **before** availability is checked, an appointment never blocks its own move. Reassigning an 11am visit from one room to another works even though the practitioner's schedule is already busy at 11am — that block belongs to the appointment being moved.

`$reschedule` is the write path for [`$find`](/docs/scheduling/appointment-find) results obtained with the `ignore-appointment` parameter. [`$book`](/docs/scheduling/appointment-book) and [`$hold`](/docs/scheduling/appointment-hold) validate against the original Slots and will reject those times.

Its inputs are the same `schedule` values you searched `$find` with, plus the `start` you chose. The visit type is not among them — the operation reads the one the Appointment is already on file for. See [What the operation writes](#what-the-operation-writes) for exactly which attributes change.

## Use Cases

- **Reassigning a resource**: Move an appointment to a different room, device, or provider at the same time
- **Moving an appointment in time**: Shift an appointment to a new slot without losing its identity or its references from other resources
- **Avoiding cancel-and-rebook**: Change an appointment atomically, rather than cancelling it and racing another booker for the new time

It moves a visit; it does not change what the visit is. Changing an appointment's visit type is a cancel-and-rebook, for the reasons under [What the operation writes](#what-the-operation-writes).

## Invoke the `$reschedule` operation

```
[base]/R4/Appointment/:id/$reschedule
```

<Tabs>
<TabItem value="ts" label="TypeScript">
  <MedplumCodeBlock language="ts" selectBlocks="rescheduleReassignRoom">
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
      { "name": "start", "valueDateTime": "2026-03-10T09:00:00.000Z" },
      { "name": "schedule", "valueReference": { "reference": "Schedule/dr-smith-schedule" } },
      { "name": "schedule", "valueReference": { "reference": "Schedule/room-two-schedule" } }
    ]
  }'
```

</TabItem>
</Tabs>

## Parameters

| Name       | Type                  | Description                                                                                | Required |
| ---------- | --------------------- | ------------------------------------------------------------------------------------------ | -------- |
| `start`    | `dateTime`            | The new start time for the appointment.                                                    | Yes      |
| `schedule` | `reference(Schedule)` | The complete list of schedules to move the appointment onto. May be passed multiple times. | Yes      |

The Appointment being rescheduled is identified by the `id` in the URL.

These are the same `schedule` values you passed to [`$find`](/docs/scheduling/appointment-find), plus the `start` of the proposal you picked from its results.

You must include all `Schedule` references that should be set on the appointment; schedules already recorded on the Appointment that are not submitted will be removed by this operation.0

:::info

Unlike `$find`, `$reschedule` takes no `service-type-reference`. The service whose scheduling parameters the move is measured against — the duration it runs for, the grid it aligns to, the buffers around it — is the one the Appointment already records in `serviceType`. An Appointment that records no service reference, or more than one, has no single set of parameters to be measured against and is [rejected](#appointment-does-not-record-exactly-one-service-type).

:::

### What the operation writes

`$reschedule` is not an update of the whole resource. It changes exactly four attributes of the stored Appointment:

| Attribute     | Effect                                                                                      |
| ------------- | ------------------------------------------------------------------------------------------- |
| `start`       | Set from the `start` parameter                                                              |
| `end`         | Derived from `start` plus the `duration` in the scheduling parameters — not an input        |
| `participant` | Reconciled, see below                                                                       |
| `slot`        | Set to references to the newly created Slots                                                |

Everything else is left exactly as it was — `serviceType`, `reasonCode`, `comment`, `basedOn`, `supportingInformation`, and anything else you have set. To change any of those, use a normal FHIR update on the Appointment.

Three things deserve specific mention:

- **`status` is not an input.** The appointment lifecycle belongs to [`$hold`](/docs/scheduling/appointment-hold), [`$confirm`](/docs/scheduling/appointment-confirm), and [`$cancel`](/docs/scheduling/appointment-cancel), each of which validates its own transition. `$reschedule` changes *when and where* an appointment happens, never *whether* it happens. A `booked` appointment stays booked; a `pending` one stays pending and keeps holding its new time with `busy-tentative` Slots.
- **`serviceType` is not an input.** What a visit *is* dose not change during a move. The requirements a visit type carries — the procedure and diagnosis codes it is booked with, which live in `Appointment.serviceType` alongside the service reference, any prior authorization, anything a `PlanDefinition` applied when it was booked — are all keyed to that type, and none of them are re-applied by a reschedule. Changing the type is a new booking: cancel and rebook. The stored `serviceType` is therefore read and never written, which also means the codes booked with the appointment survive the move untouched.
- **`participant` is reconciled, not submitted.** The actors of the Schedules being moved away from are swapped for the actors of the Schedules in the request. Everyone else — the patient, related persons, secondary practitioners — is preserved untouched, and an actor that appears on both the old and new Schedules keeps its existing entry along with any `status` it had already responded with.

### Slots are derived, not submitted

Unlike [`$book`](/docs/scheduling/appointment-book) and [`$hold`](/docs/scheduling/appointment-hold), `$reschedule` takes no `contained` Slot resources. The Slot set is fully determined by the Schedule, the start time, and the scheduling parameters — one `busy` Slot spanning `duration` minutes, plus a `busy-unavailable` Slot for each of `bufferBefore` and `bufferAfter` — so the server builds it rather than asking you to submit a copy for it to check.

### Constraints

- The stored Appointment must have `status: booked` or `status: pending`. All other statuses are rejected.
- All `Slot` resources referenced by `Appointment.slot` must exist and be readable by the caller.
- `start` must fall on the schedule's alignment grid.
- The Appointment's `serviceType` must record exactly one HealthcareService, and that service must be readable by the caller.
- Each Schedule's `serviceType` must include that HealthcareService.
- Each Schedule must have exactly **one actor**, and that actor must have a timezone defined via the `http://hl7.org/fhir/StructureDefinition/timezone` extension.
- Every Schedule in the request must agree on `duration` and the alignment parameters.
- The new time must be available on every requested Schedule, ignoring the Slots this appointment currently holds.

### Required Permissions

`$reschedule` writes more than `$book` does, so a caller who can book may not be able to reschedule. Beyond the read access `$book` requires on `Practitioner`, `HealthcareService`, and `Schedule`, the caller's [access policy](/docs/access/access-policies) must grant:

| Resource      | Interactions                              | Why                                             |
| ------------- | ----------------------------------------- | ----------------------------------------------- |
| `Slot`        | `create`, `read`, `search`, **`delete`**  | The Slots held by the appointment are deleted   |
| `Appointment` | `read`, **`update`**                      | The existing Appointment is updated in place    |

Without `delete` on `Slot`, the operation fails with `403 Forbidden`.

## Output

Returns `200 OK` with a [`Bundle`](/docs/api/fhir/resources/bundle) wrapping the resources written by the transaction:

- The updated [`Appointment`](/docs/api/fhir/resources/appointment), with the same `id` and `status` it had before, its participants reconciled, and every non-scheduling attribute unchanged
- One `Slot` per requested Schedule — `busy` for a `booked` appointment, `busy-tentative` for a `pending` one
- Zero or more buffer `Slot` resources with `status: busy-unavailable` (when `bufferBefore` or `bufferAfter` scheduling parameters are set)

The Slots held before the reschedule are deleted and do not appear in the response. Note that Slot ids therefore change on every reschedule, even when the time is unchanged, and subscribers see a delete followed by a create rather than an update. `Appointment.slot` is rewritten to reference the new Slots.

If validation of the new time fails, the whole transaction rolls back: the appointment keeps its original Slots and nothing is written.

## Error Responses

### Appointment in a Non-Reschedulable Status

```json
{
  "resourceType": "OperationOutcome",
  "issue": [
    {
      "severity": "error",
      "code": "invalid",
      "details": { "text": "Appointment cannot be rescheduled in 'cancelled' status" }
    }
  ]
}
```

### New Time Not Available

```json
{
  "resourceType": "OperationOutcome",
  "issue": [
    {
      "severity": "error",
      "code": "invalid",
      "details": { "text": "Requested time slot is not available" },
      "diagnostics": "{\"schedule\":\"Schedule/room-two-schedule\",\"blockingSlots\":[{\"reference\":\"Slot/other-slot-id\",\"start\":\"2026-03-10T09:00:00.000Z\",\"end\":\"2026-03-10T10:00:00.000Z\",\"status\":\"busy\"}]}"
    }
  ]
}
```

### Start Not on the Alignment Grid

```json
{
  "resourceType": "OperationOutcome",
  "issue": [
    {
      "severity": "error",
      "code": "invalid",
      "details": { "text": "Start time is not aligned to the scheduling grid" },
      "expression": ["Parameters.start"]
    }
  ]
}
```

### Appointment Does Not Record Exactly One Service Type

An Appointment naming no service — imported, or written outside the scheduling operations — cannot be moved, because nothing says how long it runs or what grid it sits on:

```json
{
  "resourceType": "OperationOutcome",
  "issue": [
    {
      "severity": "error",
      "code": "invalid",
      "details": { "text": "Appointment has no service reference" },
      "expression": ["Appointment.serviceType"]
    }
  ]
}
```

One naming more than one is rejected for the mirror-image reason — there is no single set of scheduling parameters to measure the move against:

```json
{
  "resourceType": "OperationOutcome",
  "issue": [
    {
      "severity": "error",
      "code": "invalid",
      "details": { "text": "Appointment has too many service references" },
      "expression": ["Appointment.serviceType"]
    }
  ]
}
```

### Schedule Does Not Offer the Requested Service

```json
{
  "resourceType": "OperationOutcome",
  "issue": [
    {
      "severity": "error",
      "code": "invalid",
      "details": { "text": "Schedule is not schedulable for requested service type" },
      "expression": ["Parameters.schedule[1]"]
    }
  ]
}
```

## Rescheduling from the UI

The [`@medplum/react-scheduling`](https://www.npmjs.com/package/@medplum/react-scheduling) library provides an `AppointmentRescheduleForm` component that drives this whole flow. Given an Appointment, it reads back the visit type it is on file for and the Schedules its Slots are held on, shows the visit type fixed and the actors as editable selections, searches with `$find` — passing `ignore-appointment` so the visit does not block its own move — and posts `$reschedule` for the time chosen. It announces the Appointment, the released Slots and the new ones, so a calendar rendered beside it refreshes without the host fetching anything.

The `AppointmentDetails` view mounts it behind a **Reschedule** button, which is how the `SchedulingWorkspace` offers rescheduling from the calendar.

## Related

- [Appointment `$find`](/docs/scheduling/appointment-find) - Find available times, using `ignore-appointment` when reassigning
- [Appointment `$book`](/docs/scheduling/appointment-book) - Book a new Appointment
- [Appointment `$cancel`](/docs/scheduling/appointment-cancel) - Cancel an Appointment and free its Slots
- [Scheduling Overview](/docs/scheduling) - High-level scheduling concepts
- [`Appointment` resource](/docs/api/fhir/resources/appointment)
- [`Slot` resource](/docs/api/fhir/resources/slot)
