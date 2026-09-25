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
| `appointment` | `Appointment` | A proposed `Appointment` resource (e.g. from `$find`). Must include `start`, `end`, and `serviceType`. Must have `Slot` resources in `contained`. Carries a `recurrenceTemplate` to [book a weekly series](#booking-a-weekly-series). | Yes      |

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

To book a weekly series found with [`$find` and `occurrence-count`](/docs/scheduling/appointment-find#finding-a-weekly-series), pass its entry from `$find` as the `appointment`, exactly as you would a single time. That entry is the series' first occurrence, and its `recurrenceTemplate` says how the series recurs. `$book` builds every later occurrence from it, and books all of them atomically: either every occurrence is created or none are. That means a series can't end up partly booked, even when another booking takes one of the later occurrences between the find and the book.

```typescript
// `series` is one entry of a $find response with occurrence-count.
declare const series: Appointment;

const bundle = await medplum.post<Bundle>(medplum.fhirUrl('Appointment', '$book'), {
  resourceType: 'Parameters',
  parameter: [{ name: 'appointment', resource: series }],
});
```

An `appointment` without a `recurrenceTemplate` is booked as a single Appointment.

### Series Constraints

- The `recurrenceTemplate` must describe a weekly series, as `$find` proposes one: a `recurrenceType` of `wk`, a `weekInterval` of 1, exactly one weekday in `weeklyTemplate`, an IANA `timezone`, and an `occurrenceCount` from 2 to 6. A template with any other element, such as `excludingDate`, is refused rather than booked without it.
- The template's `timezone` must be the schedules' [`timezone`](/docs/scheduling/defining-availability#timezone-resolution), which every schedule must share
- The template's weekday must be the weekday of the appointment's `start` in that timezone
- The appointment's `start` and `end` must match its `busy` Slots'
- Every later occurrence's local time must exist in that timezone; a series at 2:30am can't cross the night clocks spring forward
- The appointment must not carry the series tags `$book` assigns (the series `identifier`, `recurrenceId`, or `originatingAppointment`; see [Series Output](#series-output)). They are refused rather than replaced.
- All of the [constraints](#constraints) on a single booking apply to each occurrence individually

The easiest way to meet these requirements is to pass back one entry from `$find` exactly as it was returned.

### Series Output

The response Bundle holds one booked `Appointment` and its Slots per occurrence, all created in the same transaction. If any occurrence is no longer available, the whole transaction rolls back, and no occurrence is created, including ones that were still available.

Every later occurrence is a copy of the submitted appointment moved to its week, so any `participant`, `comment`, or `identifier` it carries appears on every occurrence. An identifier that should name only one occurrence is best added to that Appointment after booking.

Each booked occurrence is tagged as part of the series:

- Every occurrence shares a series `identifier` (system `https://medplum.com/fhir/recurring-appointment-series`). Read it from the response. Every occurrence of the series can then be found with `GET [base]/Appointment?identifier=https://medplum.com/fhir/recurring-appointment-series|<series id>`.
- Every occurrence carries its 1-based position as R5's `recurrenceId`, using the standard R4 [cross-version extension](https://hl7.org/fhir/R5/versions.html#extensions) `http://hl7.org/fhir/5.0/StructureDefinition/extension-Appointment.recurrenceId`.
- The first occurrence keeps the `recurrenceTemplate` it was booked from, which describes the series. No other occurrence carries one.
- Every occurrence after the first carries R5's `originatingAppointment` (`http://hl7.org/fhir/5.0/StructureDefinition/extension-Appointment.originatingAppointment`), referencing the first occurrence.

[`$reschedule`](/docs/scheduling/appointment-reschedule) keeps these tags on an occurrence it moves, and marks one moved to a new time with R5's `occurrenceChanged` (`http://hl7.org/fhir/5.0/StructureDefinition/extension-Appointment.occurrenceChanged`, valueBoolean `true`). The first occurrence's `recurrenceTemplate` keeps describing the series as booked, even when that occurrence is the one moved.

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

### Unsupported recurrenceTemplate

```json
{
  "resourceType": "OperationOutcome",
  "issue": [
    {
      "severity": "error",
      "code": "invalid",
      "details": { "text": "Unsupported recurrenceTemplate: excludingDate is not supported" },
      "expression": ["Parameters.appointment.extension[0]"]
    }
  ]
}
```

### recurrenceTemplate Timezone Mismatch

```json
{
  "resourceType": "OperationOutcome",
  "issue": [
    {
      "severity": "error",
      "code": "invalid",
      "details": { "text": "recurrenceTemplate timezone must be the schedules' timezone, America/New_York" },
      "expression": ["Parameters.appointment.extension[0]"]
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
