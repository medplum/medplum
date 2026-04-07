---
sidebar_label: Appointment $book
sidebar_position: 3
---

# Appointment $book

:::info Alpha

The `$book` operation is currently in alpha. It supports only Schedules with a single actor.

:::

The `$book` operation books an [`Appointment`](/docs/api/fhir/resources/appointment) by atomically creating the Appointment, one or more busy [`Slot`](/docs/api/fhir/resources/slot) resources, and any required buffer Slots in a single FHIR transaction. The operation validates that the requested time is genuinely available before committing.

## Use Cases

- **Single-provider booking**: Book a patient into an open slot returned by [`$find`](/docs/scheduling/schedule-find)
- **Multi-resource booking**: Simultaneously book multiple Schedules (e.g., surgeon + OR room + anesthesiologist) for the same appointment time
- **Programmatic scheduling**: Automate appointment creation from external systems while respecting provider availability rules

## Invoke the `$book` operation

```
[base]/R4/Appointment/$book
```

import Tabs from '@theme/Tabs';
import TabItem from '@theme/TabItem';

<Tabs>
<TabItem value="ts" label="TypeScript">

```typescript
import { MedplumClient } from '@medplum/core';
import type { Appointment, Bundle, Parameters, Slot } from '@medplum/fhirtypes';

const medplum = new MedplumClient();

const result = await medplum.post(
  medplum.fhirUrl('Appointment', '$book'),
  {
    resourceType: 'Parameters',
    parameter: [
      {
        name: 'slot',
        resource: {
          resourceType: 'Slot',
          status: 'free',
          start: '2026-03-10T09:00:00.000Z',
          end: '2026-03-10T10:00:00.000Z',
          schedule: { reference: 'Schedule/my-schedule-id' },
        } satisfies Slot,
      },
      {
        name: 'patient-reference',
        valueReference: { reference: 'Patient/my-patient-id' },
      },
    ],
  }
) as Parameters;

const bundle = result.parameter?.[0]?.resource as Bundle;
const appointment = bundle.entry
  ?.find((e) => e.resource?.resourceType === 'Appointment')
  ?.resource as Appointment;
```

For multi-resource bookings, add additional `slot` parameters — one per Schedule:

```typescript
const result = await medplum.post(
  medplum.fhirUrl('Appointment', '$book'),
  {
    resourceType: 'Parameters',
    parameter: [
      {
        name: 'slot',
        resource: {
          resourceType: 'Slot',
          status: 'free',
          start: '2026-03-11T08:00:00.000Z',
          end: '2026-03-11T10:00:00.000Z',
          schedule: { reference: 'Schedule/surgeon-schedule-id' },
          serviceType: [{ coding: [{ code: 'bariatric-surgery' }] }],
        } satisfies Slot,
      },
      {
        name: 'slot',
        resource: {
          resourceType: 'Slot',
          status: 'free',
          start: '2026-03-11T08:00:00.000Z',
          end: '2026-03-11T10:00:00.000Z',
          schedule: { reference: 'Schedule/or-room-schedule-id' },
        } satisfies Slot,
      },
    ],
  }
) as Parameters;
```

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
        "name": "slot",
        "resource": {
          "resourceType": "Slot",
          "status": "free",
          "start": "2026-03-10T09:00:00.000Z",
          "end": "2026-03-10T10:00:00.000Z",
          "schedule": { "reference": "Schedule/my-schedule-id" }
        }
      },
      {
        "name": "patient-reference",
        "valueReference": { "reference": "Patient/my-patient-id" }
      }
    ]
  }'
```

</TabItem>
</Tabs>

## Parameters

| Name               | Type        | Description                                                                                                               | Required |
| ------------------ | ----------- | ------------------------------------------------------------------------------------------------------------------------- | -------- |
| `slot`             | `Resource`  | A `Slot` resource describing the desired booking time. Must include `start`, `end`, and `schedule`. Repeatable for multi-resource bookings. | Yes (1+) |
| `patient-reference`| `Reference` | Reference to a [`Patient`](/docs/api/fhir/resources/patient) to include as a participant on the Appointment               | No       |

### Multi-resource Bookings

Pass multiple `slot` parameters (one per Schedule) to book all resources atomically. All slots must share the same `start` and `end` times.

```json
{
  "resourceType": "Parameters",
  "parameter": [
    {
      "name": "slot",
      "resource": {
        "resourceType": "Slot",
        "status": "free",
        "start": "2026-03-11T08:00:00.000Z",
        "end": "2026-03-11T10:00:00.000Z",
        "schedule": { "reference": "Schedule/surgeon-schedule-id" },
        "serviceType": [{ "coding": [{ "code": "bariatric-surgery" }] }]
      }
    },
    {
      "name": "slot",
      "resource": {
        "resourceType": "Slot",
        "status": "free",
        "start": "2026-03-11T08:00:00.000Z",
        "end": "2026-03-11T10:00:00.000Z",
        "schedule": { "reference": "Schedule/or-room-schedule-id" }
      }
    }
  ]
}
```

### Constraints

- All `slot` parameters must share the same `start` and `end` times
- Each referenced Schedule must have exactly **one actor**
- Each actor must have a timezone defined via the `http://hl7.org/fhir/StructureDefinition/timezone` extension
- The requested time must match a valid slot duration from the Schedule's `SchedulingParameters`
- No existing busy Slots may overlap the requested time window (including buffer windows)

## Output

Returns `201 Created` with a [`Parameters`](/docs/api/fhir/resources/parameters) resource wrapping a `Bundle` containing all persisted resources:

- One [`Appointment`](/docs/api/fhir/resources/appointment) with `status: booked`
- One `Slot` per input slot parameter with `status: busy`
- Zero or more buffer `Slot` resources with `status: busy-unavailable` (created automatically from `bufferBefore`/`bufferAfter` settings on the Schedule)

### Example Response

```json
{
  "resourceType": "Parameters",
  "parameter": [
    {
      "name": "return",
      "resource": {
        "resourceType": "Bundle",
        "type": "searchset",
        "entry": [
          {
            "resource": {
              "resourceType": "Appointment",
              "id": "new-appointment-id",
              "status": "booked",
              "start": "2026-03-10T09:00:00.000Z",
              "end": "2026-03-10T10:00:00.000Z",
              "participant": [
                { "actor": { "reference": "Practitioner/dr-smith" }, "status": "tentative" },
                { "actor": { "reference": "Patient/my-patient-id" }, "status": "accepted" }
              ]
            }
          },
          {
            "resource": {
              "resourceType": "Slot",
              "id": "booked-slot-id",
              "status": "busy",
              "start": "2026-03-10T09:00:00.000Z",
              "end": "2026-03-10T10:00:00.000Z",
              "schedule": { "reference": "Schedule/my-schedule-id" }
            }
          }
        ]
      }
    }
  ]
}
```

## Booking Logic

`$book` performs the following steps inside a serializable transaction:

1. Validates that each proposed Slot's start/end matches a valid slot duration defined in the Schedule's `SchedulingParameters`
2. Loads existing Slots in the time window (including buffer margins) for each Schedule
3. Checks that no existing busy Slot overlaps the requested time
4. Verifies the requested time falls within the Schedule's defined availability windows
5. Creates the `Appointment`, busy `Slot`(s), and any buffer `Slot`(s) atomically
6. Returns all created resources in the response Bundle

The transaction uses serializable isolation to prevent double-booking under concurrent requests.

## Error Responses

### Time No Longer Available

```json
{
  "resourceType": "OperationOutcome",
  "issue": [{ "severity": "error", "code": "conflict", "details": { "text": "Requested time slot is no longer available" } }]
}
```

### No Availability Found

```json
{
  "resourceType": "OperationOutcome",
  "issue": [{ "severity": "error", "code": "invalid", "details": { "text": "No availability found at this time" } }]
}
```

### Mismatched Slot Times

```json
{
  "resourceType": "OperationOutcome",
  "issue": [{ "severity": "error", "code": "invalid", "details": { "text": "Mismatched slot start times" } }]
}
```

### No Matching Scheduling Parameters

```json
{
  "resourceType": "OperationOutcome",
  "issue": [{ "severity": "error", "code": "invalid", "details": { "text": "No matching scheduling parameters found" } }]
}
```

### Actor Missing Timezone

```json
{
  "resourceType": "OperationOutcome",
  "issue": [{ "severity": "error", "code": "invalid", "details": { "text": "No timezone specified" } }]
}
```

## Related

- [Schedule `$find`](/docs/scheduling/schedule-find) - Find available Slots before booking
- [Defining Availability](/docs/scheduling/defining-availability) - How to configure `SchedulingParameters` on a Schedule
- [Scheduling Overview](/docs/scheduling) - High-level scheduling concepts
- [`Appointment` resource](/docs/api/fhir/resources/appointment)
- [`Slot` resource](/docs/api/fhir/resources/slot)
- [FHIR Transaction Bundles](/docs/fhir-datastore/fhir-batch-requests#batches-vs-transactions)
