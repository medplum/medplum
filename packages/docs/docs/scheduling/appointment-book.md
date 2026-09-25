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

The `$book` operation books an [`Appointment`](/docs/api/fhir/resources/appointment) by atomically creating the Appointment, one or more busy [`Slot`](/docs/api/fhir/resources/slot) resources, and any required buffer Slots in a single FHIR transaction. The operation validates that the requested time is genuinely available before committing.

## Use Cases

- **Direct booking**: Book an appointment directly from a `$find` result, without a prior hold
- **Multi-resource booking**: Simultaneously book multiple Schedules (e.g., surgeon + OR room + anesthesiologist) for the same appointment time
- **Programmatic scheduling**: Automate appointment creation from external systems while respecting provider availability rules
- **Recurring visits**: Book every visit of a weekly series at once, or none of them. See [Booking a weekly series](#booking-a-weekly-series)

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
| `appointment` | `Appointment` | A proposed `Appointment` resource (e.g. from `$find`). Must include `start`, `end`, and `serviceType`. Must have `Slot` resources in `contained`. Repeat once per occurrence (2 to 6) to [book a weekly series](#booking-a-weekly-series). | Yes      |

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

- One [`Appointment`](/docs/api/fhir/resources/appointment) with `status: "booked"`
- One `Slot` per contained Slot with `status: "busy"`
- Zero or more buffer `Slot` resources with `status: "busy-unavailable"` (when `bufferBefore` or `bufferAfter` scheduling parameters are set)

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

## Booking a weekly series

To book every occurrence of a weekly series found with [`$find` and `occurrence-count`](/docs/scheduling/appointment-find#finding-a-weekly-series), pass one `appointment` parameter per occurrence. `$book` books all of them atomically: either every occurrence is created or none are. That means a series can't end up partly booked, even when another booking takes one of the later occurrences between the find and the book.

```typescript
// `occurrences` holds the Appointments of one series: one nested Bundle's entries from $find.
declare const occurrences: Appointment[];

const bundle = await medplum.post<Bundle>(medplum.fhirUrl('Appointment', '$book'), {
  resourceType: 'Parameters',
  parameter: occurrences.map((appointment) => ({ name: 'appointment', resource: appointment })),
});
```

One `appointment` is booked as a single Appointment. Two to six are booked together as one weekly series.

### Series Constraints

- Ordered by `start` (they may be passed in any order), the appointments must fall exactly one week apart, at the same local time in the schedules' [`timezone`](/docs/scheduling/defining-availability#timezone-resolution)
- Every appointment's schedules must share one `timezone`
- Each appointment's `start` and `end` must match its `busy` Slots'
- All of the [constraints](#constraints) on a single booking apply to each occurrence individually

The easiest way to meet these requirements is to pass back one series from `$find` exactly as it was returned.

### Series Output

The response Bundle holds one booked `Appointment` and its Slots per occurrence, all created in the same transaction. If any occurrence is no longer available, the whole transaction rolls back, and no occurrence is created, including ones that were still available.

Each booked occurrence is tagged as part of the series, replacing any series tags the submitted appointments carried:

- Every occurrence shares a series `identifier` (system `https://medplum.com/fhir/recurring-appointment-series`). Read it from the response. Every occurrence of the series can then be found with `GET [base]/Appointment?identifier=https://medplum.com/fhir/recurring-appointment-series|<series id>`.
- Every occurrence carries its 1-based position as R5's `recurrenceId`, using the standard R4 [cross-version extension](https://hl7.org/fhir/R5/versions.html#extensions) `http://hl7.org/fhir/5.0/StructureDefinition/extension-Appointment.recurrenceId`.
- The first occurrence carries R5's `recurrenceTemplate` (`http://hl7.org/fhir/5.0/StructureDefinition/extension-Appointment.recurrenceTemplate`), describing the series:
  - `recurrenceType`: always `wk` (weekly)
  - `occurrenceCount`
  - `weeklyTemplate`: the weekday the series falls on, every week
  - `timezone`: the timezone whose local time the series keeps, which is the schedules' `timezone`
- Every occurrence after the first carries R5's `originatingAppointment` (`http://hl7.org/fhir/5.0/StructureDefinition/extension-Appointment.originatingAppointment`), referencing the first occurrence.

## Booking Logic

`$book` performs the following steps atomically inside a database transaction, ensuring safety when concurrent booking requests are received.

1. Validates that each proposed Slot's start/end matches a valid slot duration defined in the Schedule's `SchedulingParameters`
2. Loads existing Slots in the time window (including buffer margins) for each Schedule
3. Checks that the requested time has spare capacity under the strictest applicable limit — the requested `slotCapacity` and the tolerance of every `busy`/`busy-tentative` booking already overlapping it (at the default capacity of 1, any overlapping busy Slot blocks it), and no `busy-unavailable` block or buffer conflicts
4. Verifies the requested time falls within the Schedule's defined availability windows or existing slots with status `free`
5. Creates the `Appointment`, busy `Slot`(s), and any buffer `Slot`(s)
6. Returns all created resources in the response Bundle

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

### Series Not Weekly

```json
{
  "resourceType": "OperationOutcome",
  "issue": [
    {
      "severity": "error",
      "code": "invalid",
      "details": { "text": "Appointments in a recurring series must be one week apart, at the same local time" }
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

- `bookingLimit` - An upcoming scheduling parameter that will allow you to express how often a given service type may be added to a schedule. This is not yet enforced in `$book`.

## Related

- [Appointment `$find`](/docs/scheduling/appointment-find) - Find available Slots before booking
- [Appointment `$hold`](/docs/scheduling/appointment-hold) - Reserve an unconfirmed appointment
- [Defining Availability](/docs/scheduling/defining-availability) - How to configure `SchedulingParameters` on a Schedule
- [Scheduling Overview](/docs/scheduling) - High-level scheduling concepts
- [`Appointment` resource](/docs/api/fhir/resources/appointment)
- [`Slot` resource](/docs/api/fhir/resources/slot)
- [FHIR Transaction Bundles](/docs/fhir-datastore/fhir-batch-requests#batches-vs-transactions)
