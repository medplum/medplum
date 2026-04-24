---
sidebar_label: Appointment $find
sidebar_position: 2
---

# Appointment $find

:::info[Alpha]

The `$find` operation is currently in alpha.

:::

The `$find` operation takes a list of [`Schedule`](/docs/api/fhir/resources/schedule) references and a [`HealthcareService`](/docs/api/fhir/resources/healthcareservice) reference and returns a bundle of proposed [`Appointment`](/docs/api/fhir/resources/appointment) resources within a specified time range. Slots are computed dynamically from each [`SchedulingParameters`](/docs/scheduling/defining-availability) extensions on each Schedule and HealthcareService — no Slots need to be pre-generated.

Existing slots from each input Schedule are used to restrict or expand that schedule's availability, based on the slot's `status`.

## Use Cases

- **Patient-facing booking flows**: Show a patient the available time windows for a given provider or location
- **Availability checks**: Determine whether a provider has open time before attempting to book
- **Multi-provider scheduling**: Query multiple Schedules and intersect results to find shared availability

## Invoke the `$find` operation

```
[base]/R4/Appointment/$find
```

import Tabs from '@theme/Tabs';
import TabItem from '@theme/TabItem';

<Tabs>
<TabItem value="ts" label="TypeScript">

```typescript
import { MedplumClient } from '@medplum/core';
import type { Bundle, Parameters, Appointment } from '@medplum/fhirtypes';

const medplum = new MedplumClient();

const result = await medplum.post(
  medplum.fhirUrl('Appointment', '$find'),
  {
    resourceType: 'Parameters',
    parameter: [
      { name: 'start', valueDateTime: '2026-03-10T09:00:00-05:00' },
      { name: 'end', valueDateTime: '2026-03-10T17:00:00-05:00' },
      { name: 'service-type-reference', valueReference: { reference: "HealthcareService/my-healthcareservice-id"} },
      { name: 'schedule', valueReference: { reference: "Schedule/my-schedule-id" } },
      // Optional: limit number of results
      { name: '_count', valueInteger: 10 },
    ],
  }
) as Parameters;

const bundle = result.parameter?.[0]?.resource as Bundle<Appointment>;
const appointments = bundle.entry?.map((e) => e.resource as Appointment) ?? [];
```

</TabItem>
<TabItem value="curl" label="cURL">

```bash
curl -X POST 'https://api.medplum.com/fhir/R4/Appointment/$find' \
  -H "Content-Type: application/fhir+json" \
  -H "Authorization: Bearer MY_ACCESS_TOKEN" \
  -d '{
    "resourceType": "Parameters",
    "parameter": [
      { "name": "start", "valueDateTime": "2026-03-10T09:00:00-05:00" },
      { "name": "end",   "valueDateTime": "2026-03-10T17:00:00-05:00" },
      { "name": "service-type-reference", "valueReference": { "reference": "HealthcareService/my-healthcareservice-id" } },
      { "name": "schedule", "valueReference": { "reference": "Schedule/my-schedule-id" } },
    ]
  }'
```

</TabItem>
</Tabs>

## Parameters

| Name                     | Type                             | Description                                                                                  | Required |
| ------------------------ | -------------------------------- | ---------------------------------------------------------------------------------------------| -------- |
| `start`                  | `dateTime`                       | Start of the search window (inclusive)                                                       | Yes      |
| `end`                    | `dateTime`                       | End of the search window (inclusive)                                                         | Yes      |
| `service-type-reference` | `reference(HealthcareService)`   | The HealthcareService describing the type of appointment to be scheduled.                    | Yes      |
| `schedule`               | `reference(Schedule)`            | A schedule to check for availability. May be passed multiple times with different schedules. | Yes      |
| `_count`                 | `integer`                        | Maximum number of Appointment resources to return. Defaults to 20. Maximum is 1000.          | No       |

### Constraints

- `start` must be before `end`
- The search window cannot exceed **31 days**
- At least one schedule must be provided
- Each schedule must have exactly **one actor** reference
- Each schedule's `serviceType` field must match the requested HealthcareService.type
- Each schedule's actor (Practitioner, Location, or Device) must have a timezone defined via the `http://hl7.org/fhir/StructureDefinition/timezone` extension

## Output

Returns a [`Parameters`](/docs/api/fhir/resources/parameters) resource wrapping a `Bundle` of `Appointment` resources with `status: proposed`.

The Appointments are virtual — they are not persisted in the FHIR store. Each Appointment has a `contained` attribute holding virtual (not persisted) Slot resources. These contained resources represent Slot resources that will be created if this Appointment is booked.

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
              "status": "proposed",
              "start": "2026-03-10T09:00:00.000Z",
              "end": "2026-03-10T10:00:00.000Z",
              "participant": [
                {
                  "actor": { "reference": "Practitioner/my-practitioner-id" },
                  "required": "required",
                  "status": "needs-action"
                }
              ],
              "serviceType": [
                {
                  "text": "Office Visit",
                  "coding": [{ "system": "http://example.org/appointment-types", "code": "office-visit" }]
                }
              ],
              "contained": [
                {
                  "resourceType": "Slot",
                  "status": "busy",
                  "start": "2026-03-10T09:00:00.000Z",
                  "end": "2026-03-10T10:00:00.000Z",
                  "serviceType": [
                    {
                      "text": "Office Visit",
                      "coding": [{ "system": "http://example.org/appointment-types", "code": "office-visit" }]
                    }
                  ],
                  "schedule": { "reference": "Schedule/my-schedule-id" }
                }
              ]
            }
          },
          {
            "resource": {
              "resourceType": "Appointment",
              "status": "proposed",
              "start": "2026-03-10T10:00:00.000Z",
              "end": "2026-03-10T11:00:00.000Z",
              "participant": [
                {
                  "actor": { "reference": "Practitioner/my-practitioner-id" },
                  "required": "required",
                  "status": "needs-action"
                }
              ],
              "serviceType": [
                {
                  "text": "Office Visit",
                  "coding": [{ "system": "http://example.org/appointment-types", "code": "office-visit" }]
                }
              ],
              "contained": [
                {
                  "resourceType": "Slot",
                  "status": "busy",
                  "start": "2026-03-10T10:00:00.000Z",
                  "end": "2026-03-10T11:00:00.000Z",
                  "serviceType": [
                    {
                      "text": "Office Visit",
                      "coding": [{ "system": "http://example.org/appointment-types", "code": "office-visit" }]
                    }
                  ],
                  "schedule": { "reference": "Schedule/my-schedule-id" }
                }
              ]
            }
          }
        ]
      }
    }
  ]
}
```


## Availability Logic

`$find` calculates available windows by:

1. Reading each Schedule's `SchedulingParameters` extension to determine recurring availability windows, slot duration, buffer times, and alignment constraints
2. Fetching existing Slot resources for each Schedule in the requested range (busy, busy-tentative, busy-unavailable, and free slots)
3. Subtracting occupied time (including buffer windows around booked slots) from the availability windows
4. Applying alignment intervals and offsets to produce valid start times
5. Returning Appointments up to `_count`

See [Defining Availability](/docs/scheduling/defining-availability) for full details on how `SchedulingParameters` are configured.

## Error Responses

### Invalid Time Range

```json
{
  "resourceType": "OperationOutcome",
  "issue": [{ "severity": "error", "code": "invalid", "details": { "text": "Invalid search time range" } }]
}
```

### Range Exceeds 31 Days

```json
{
  "resourceType": "OperationOutcome",
  "issue": [{ "severity": "error", "code": "invalid", "details": { "text": "Search range cannot exceed 31 days" } }]
}
```

### Actor Missing Timezone

```json
{
  "resourceType": "OperationOutcome",
  "issue": [{ "severity": "error", "code": "invalid", "details": { "text": "No timezone specified" } }]
}
```

### Schedule Has Multiple Actors

```json
{
  "resourceType": "OperationOutcome",
  "issue": [{ "severity": "error", "code": "invalid", "details": { "text": "$find only supported on schedules with exactly one actor" } }]
}
```

### `Schedule.serviceType` does not match `HealthcareService.type`

```json
{
  "resourceType": "OperationOutcome",
  "issue": [{ "severity": "error", "code": "invalid", "details": { "text": "Schedule is not schedulable for requested service type" } }]
}
```
## Related

- [Appointment `$book`](/docs/scheduling/appointment-book) - Book one of the returned Appointments
- [Defining Availability](/docs/scheduling/defining-availability) - How to configure `SchedulingParameters` on a Schedule
- [Scheduling Overview](/docs/scheduling) - High-level scheduling concepts
- [`Schedule` resource](/docs/api/fhir/resources/schedule)
- [`Appointment` resource](/docs/api/fhir/resources/appointment)
- [`Slot` resource](/docs/api/fhir/resources/slot)
