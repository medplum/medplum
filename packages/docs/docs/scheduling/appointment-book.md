---
sidebar_label: Appointment $book
sidebar_position: 3
---

import ExampleCode from '!!raw-loader!@site/../examples/src/scheduling/book.ts';
import MedplumCodeBlock from '@site/src/components/MedplumCodeBlock';
import Tabs from '@theme/Tabs';
import TabItem from '@theme/TabItem';

# Appointment $book

:::info[Alpha]

The `$book` operation is currently in alpha.

:::

The `$book` operation books an [`Appointment`](/docs/api/fhir/resources/appointment) by atomically creating the Appointment, one or more busy [`Slot`](/docs/api/fhir/resources/slot) resources, and any required buffer Slots in a single FHIR transaction. The operation validates that the requested time is genuinely available before committing.

## Use Cases

- **Direct booking**: Book an appointment directly from a `$find` result, without a prior hold
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
| `appointment` | `Appointment` | A proposed `Appointment` resource (e.g. from `$find`). Must include `start`, `end`, and `serviceType`. Must have `Slot` resources in `contained`.             | Yes      |

### Appointment Input

The `appointment` parameter accepts a proposed `Appointment` resource, exactly as returned by [`$find`](/docs/scheduling/appointment-find). The Appointment must include `contained` Slot resources that describe which Schedules to book.

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
- No existing busy Slots may overlap the requested time window (including buffer windows)
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

## Booking Logic

`$book` performs the following steps atomically inside a database transaction:

1. Validates that each proposed Slot's start/end matches a valid slot duration defined in the Schedule's `SchedulingParameters`
2. Loads existing Slots in the time window (including buffer margins) for each Schedule
3. Checks that no existing busy Slot overlaps the requested time
4. Verifies the requested time falls within the Schedule's defined availability windows
5. Creates the `Appointment`, busy `Slot`(s), and any buffer `Slot`(s) atomically
6. Returns all created resources in the response Bundle

The transaction uses serializable isolation to prevent double-booking under concurrent requests.

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

## Related

- [Appointment `$find`](/docs/scheduling/appointment-find) - Find available Slots before booking
- [Appointment `$hold`](/docs/scheduling/appointment-hold) - Optionally reserve a slot before confirming
- [Defining Availability](/docs/scheduling/defining-availability) - How to configure `SchedulingParameters` on a Schedule
- [Scheduling Overview](/docs/scheduling) - High-level scheduling concepts
- [`Appointment` resource](/docs/api/fhir/resources/appointment)
- [`Slot` resource](/docs/api/fhir/resources/slot)
- [FHIR Transaction Bundles](/docs/fhir-datastore/fhir-batch-requests#batches-vs-transactions)
