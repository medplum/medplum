---
sidebar_label: Appointment $book
sidebar_position: 3
---

import ExampleCode from '!!raw-loader!@site/../examples/src/scheduling/book.ts';
import MedplumCodeBlock from '@site/src/components/MedplumCodeBlock';
import Tabs from '@theme/Tabs';
import TabItem from '@theme/TabItem';

# Appointment $book

:::info[Beta]

The `$book` operation is currently in [beta](/docs/compliance/alpha-beta).

:::

The `$book` operation books an [`Appointment`](/docs/api/fhir/resources/appointment) by atomically creating the Appointment, one or more busy [`Slot`](/docs/api/fhir/resources/slot) resources, and any required buffer Slots in a single FHIR transaction. The operation validates that the requested time is genuinely available before committing. It can also book every occurrence of a [weekly recurring series](#booking-a-recurring-series) in the same transaction.

## Use Cases

- **Direct booking**: Book an appointment directly from a `$find` result, without a prior hold
- **Recurring booking**: Book every occurrence of a weekly series found by `$find` with `occurrence-count`, all or none
- **Multi-resource booking**: Simultaneously book multiple Schedules (e.g., surgeon + OR room + anesthesiologist) for the same appointment time
- **Programmatic scheduling**: Automate appointment creation from external systems while respecting provider availability rules

## Invoke the `$book` operation

```
[base]/R4/Appointment/$book
```


<Tabs>
<TabItem value="ts" label="TypeScript">
  <MedplumCodeBlock language="ts" selectBlocks="bookOne">
    {ExampleCode}
  </MedplumCodeBlock>
</TabItem>
<TabItem value="curl" label="cURL">

```bash
curl -X POST 'https://api.medplum.com/fhir/R4/Appointment/$book' \
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
          "start": "2026-03-10T09:00:00.000Z",
          "end": "2026-03-10T10:00:00.000Z",
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
              "start": "2026-03-10T09:00:00.000Z",
              "end": "2026-03-10T10:00:00.000Z"
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

| Name          | Type          | Description                                                                                                                                                   | Required |
| ------------- | ------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------- |
| `appointment` | `Appointment` | A proposed `Appointment` resource (e.g. from `$find`). Must include `start`, `end`, and `serviceType`. Must have `Slot` resources in `contained`. May carry a `recurrenceTemplate` to book a weekly series; see [Booking a recurring series](#booking-a-recurring-series). | Yes      |

### Appointment Input

The `appointment` parameter accepts a proposed `Appointment` resource, exactly as returned by [`$find`](/docs/scheduling/appointment-find). The Appointment must include `contained` Slot resources that describe when to book each Schedule.

Every contained Slot must have `status: "busy"` (the booking itself) or `status: "busy-unavailable"` (a buffer), and must cover a positive duration. Any other status — or a Slot whose `end` is not after its `start` — is rejected, since `$book` has no defined capacity semantics for it.

```json
{
  "resourceType": "Parameters",
  "parameter": [
    {
      "name": "appointment",
      "resource": {
        "resourceType": "Appointment",
        "status": "proposed",
        "start": "2026-03-10T09:00:00.000Z",
        "end": "2026-03-10T10:00:00.000Z",
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
          { "actor": { "reference": "Practitioner/dr-smith" }, "required": "required", "status": "needs-action" }
        ],
        "contained": [
          {
            "resourceType": "Slot",
            "status": "busy",
            "schedule": { "reference": "Schedule/dr-smith-schedule" },
            "start": "2026-03-10T09:00:00.000Z",
            "end": "2026-03-10T10:00:00.000Z"
          }
        ]
      }
    }
  ]
}
```

For multi-resource bookings, include multiple Slot resources in `Appointment.contained`:

```json
{
  "resourceType": "Parameters",
  "parameter": [
    {
      "name": "appointment",
      "resource": {
        "resourceType": "Appointment",
        "status": "proposed",
        "start": "2026-03-11T08:00:00.000Z",
        "end": "2026-03-11T10:00:00.000Z",
        "serviceType": [
          {
            "coding": [{ "code": "bariatric-surgery" }],
            "extension": [
              {
                "url": "https://medplum.com/fhir/service-type-reference",
                "valueReference": { "reference": "HealthcareService/my-healthcareservice-id" }
              }
            ]
          }
        ],
        "participant": [
          { "actor": { "reference": "Practitioner/dr-smith" }, "required": "required", "status": "needs-action" },
          { "actor": { "reference": "Location/or-room-1" }, "required": "required", "status": "needs-action" }
        ],
        "contained": [
          {
            "resourceType": "Slot",
            "status": "busy",
            "schedule": { "reference": "Schedule/surgeon-schedule-id" },
            "start": "2026-03-11T08:00:00.000Z",
            "end": "2026-03-11T10:00:00.000Z"
          },
          {
            "resourceType": "Slot",
            "status": "busy",
            "schedule": { "reference": "Schedule/or-room-schedule-id" },
            "start": "2026-03-11T08:00:00.000Z",
            "end": "2026-03-11T10:00:00.000Z"
          }
        ]
      }
    }
  ]
}
```

### Constraints

- Each referenced Schedule must have exactly **one actor**
- Each actor must have a timezone defined via the `http://hl7.org/fhir/StructureDefinition/timezone` extension
- The requested time must match a valid slot duration from the Schedule's `SchedulingParameters`
- The requested time must have fewer slots than the requested `slotCapacity`. All existing slots overlapping the requested time must be below their maximum `slotCapacity`. See [Overbooking](/docs/scheduling/defining-availability#overbooking)
- The `serviceType` attribute must reference the HealthcareService you are trying to schedule via the `https://medplum.com/fhir/service-type-reference` extension
- The input `Appointment` must not already contain `slot` references (these are set by `$book`)

The easiest way to meet these requirements is to use a result from a [`$find` operation](/docs/scheduling/appointment-find).

## Output

Returns `201 Created` with a [`Bundle`](/docs/api/fhir/resources/bundle) wrapping all persisted resources:

- One [`Appointment`](/docs/api/fhir/resources/appointment) with `status: "booked"`, or one per occurrence for a recurring series
- One `Slot` per contained Slot with `status: "busy"`
- Zero or more buffer `Slot` resources with `status: "busy-unavailable"` (when `bufferBefore` or `bufferAfter` scheduling parameters are set)

When booking a [recurring series](#booking-a-recurring-series), the Bundle holds one booked Appointment per occurrence, in order, each followed by its own Slots.

### Example Response

```json
{
  "resourceType": "Bundle",
  "type": "transaction-response",
  "entry": [
    {
      "resource": {
        "resourceType": "Appointment",
        "id": "new-appointment-id",
        "status": "booked",
        "start": "2026-03-10T09:00:00.000Z",
        "end": "2026-03-10T10:00:00.000Z",
        "participant": [
          { "actor": { "reference": "Practitioner/dr-smith" }, "status": "tentative" }
        ],
        "slot": [{ "reference": "Slot/booked-slot-id" }]
      }
    },
    {
      "resource": {
        "resourceType": "Slot",
        "id": "booked-slot-id",
        "status": "busy",
        "start": "2026-03-10T09:00:00.000Z",
        "end": "2026-03-10T10:00:00.000Z",
        "schedule": { "reference": "Schedule/dr-smith-schedule" }
      }
    }
  ]
}
```

## Booking a recurring series

Passing a [recurring series](/docs/scheduling/appointment-find#finding-a-recurring-series) entry
from `$find` books **every occurrence** of the series, all or none. Pass the entry unchanged: its
`recurrenceTemplate` extension tells `$book` how the series recurs.

- Each later occurrence is booked at the same local time in the template's timezone, whole weeks
  later, so the series keeps its local time across DST transitions.
- Each occurrence has its own `busy` Slot, and buffer Slots if the Schedule has them, shifted
  along with it.
- If any occurrence is unavailable, nothing is booked.
- Only the first occurrence keeps the `recurrenceTemplate` and the `requestedPeriod`, if any.
  Every other element of the proposed Appointment is copied to each occurrence.

### Template requirements

`$book` reads the `recurrenceTemplate` strictly, and refuses any template that isn't in the shape
`$find` returns:

- `recurrenceType` must be weekly (`wk`), with a `weekInterval` of 1
- `occurrenceCount` must be between **2** and **6**
- `weeklyTemplate` must name only the first occurrence's weekday, in the template's timezone
- `timezone` must be an IANA timezone (e.g. `America/New_York`), not a UTC offset
- Other R5 elements, such as `excludingDate`, are refused rather than ignored
- Every `start` and `end`, on the Appointment and on its contained Slots, must be an instant with
  a timezone offset
- A series with an occurrence at a local time skipped by a DST transition is refused

### Identifying the series

`$book` and [`$hold`](/docs/scheduling/appointment-hold#holding-a-recurring-series) tag every
occurrence they create with:

- An `identifier` shared by the whole series, with the system
  `https://medplum.com/fhir/recurring-appointment-series` and a value generated by the server
- R5's [`recurrenceId`](https://hl7.org/fhir/R5/appointment-definitions.html#Appointment.recurrenceId),
  as the R4 cross-version extension, giving the occurrence's 1-based position in the series

`@medplum/core` exports these URLs as `RecurringAppointmentSeriesIdentifierSystem` and
`RecurrenceIdExtensionURI`. When booking or holding a series, the proposed Appointment must not
already carry either one, because the operation assigns them.

```json
{
  "resourceType": "Appointment",
  "id": "second-occurrence-id",
  "status": "booked",
  "start": "2026-03-09T13:00:00.000Z",
  "end": "2026-03-09T14:00:00.000Z",
  "identifier": [
    { "system": "https://medplum.com/fhir/recurring-appointment-series", "value": "6f1c3e2a-5b7d-4e0f-9a8b-2c4d6e8f0a1b" }
  ],
  "extension": [
    { "url": "http://hl7.org/fhir/5.0/StructureDefinition/extension-Appointment.recurrenceId", "valuePositiveInt": 2 }
  ],
  "slot": [{ "reference": "Slot/second-occurrence-slot-id" }]
}
```

To find every occurrence of a series later, search by its identifier:

```
[base]/R4/Appointment?identifier=https://medplum.com/fhir/recurring-appointment-series|6f1c3e2a-5b7d-4e0f-9a8b-2c4d6e8f0a1b
```

## Booking Logic

`$book` performs the following steps atomically inside a database transaction, ensuring safety when concurrent booking requests are received.

1. Validates that each proposed Slot's start/end matches a valid slot duration defined in the Schedule's `SchedulingParameters`
2. Loads existing Slots in the time window (including buffer margins) for each Schedule
3. Checks that the requested time has spare capacity under the strictest applicable limit — the requested `slotCapacity` and the tolerance of every `busy`/`busy-tentative` booking already overlapping it (at the default capacity of 1, any overlapping busy Slot blocks it), and no `busy-unavailable` block or buffer conflicts
4. Verifies the requested time falls within the Schedule's defined availability windows or existing slots with status `free`
5. Creates the `Appointment`, busy `Slot`(s), and any buffer `Slot`(s)
6. Returns all created resources in the response Bundle

When booking a [recurring series](#booking-a-recurring-series), steps 1–5 run for each occurrence in turn, in the same transaction, so each occurrence is checked against the ones booked before it. If any occurrence is unavailable, the whole transaction rolls back and nothing is booked.

Because these steps run inside a `SERIALIZABLE` transaction, two requests racing for the last unit of capacity cannot both succeed — one commits and the other is rejected. An outstanding [`$hold`](/docs/scheduling/appointment-hold) also consumes a unit of `slotCapacity` (via its `busy-tentative` Slot) until it is confirmed, booked, or released.

## Error Responses

### Time Not Available

```json
{
  "resourceType": "OperationOutcome",
  "issue": [{ "severity": "error", "code": "invalid", "details": { "text": "Requested time slot is not available" } }]
}
```

### Mismatched Slot Times

```json
{
  "resourceType": "OperationOutcome",
  "issue": [{ "severity": "error", "code": "invalid", "details": { "text": "Mismatched slot start times" } }]
}
```

### Actor Missing Timezone

```json
{
  "resourceType": "OperationOutcome",
  "issue": [{ "severity": "error", "code": "invalid", "details": { "text": "No timezone specified" } }]
}
```

### Unsupported Recurrence Template

Returned when a `recurrenceTemplate` doesn't meet the [template requirements](#template-requirements). The message after the colon says which requirement failed.

```json
{
  "resourceType": "OperationOutcome",
  "issue": [
    {
      "severity": "error",
      "code": "invalid",
      "details": { "text": "Unsupported recurrenceTemplate: occurrenceCount must be an integer between 2 and 6" }
    }
  ]
}
```

### HealthcareService is inactive

```json
{
  "resourceType": "OperationOutcome",
  "issue": [{ "severity": "error", "code": "invalid", "details": { "text": "HealthcareService is inactive" } }]
}
```

## Beta Status

The Scheduling API is under active development. This [beta](/docs/compliance/alpha-beta) release of the scheduling API is expected to gain additional capabilities.

- Recurring series are limited to weekly recurrences of 2 to 6 occurrences.
- `bookingLimit` - An upcoming scheduling parameter that will allow you to express how often a given service type may be added to a schedule. This is not yet enforced in `$book`.

## Related

- [Appointment `$find`](/docs/scheduling/appointment-find) - Find available Slots before booking
- [Appointment `$hold`](/docs/scheduling/appointment-hold) - Reserve an unconfirmed appointment
- [Defining Availability](/docs/scheduling/defining-availability) - How to configure `SchedulingParameters` on a Schedule
- [Scheduling Overview](/docs/scheduling) - High-level scheduling concepts
- [`Appointment` resource](/docs/api/fhir/resources/appointment)
- [`Slot` resource](/docs/api/fhir/resources/slot)
- [FHIR Transaction Bundles](/docs/fhir-datastore/fhir-batch-requests#batches-vs-transactions)
