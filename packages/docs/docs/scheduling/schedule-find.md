---
sidebar_label: Schedule $find
sidebar_position: 2
---

# Schedule $find

:::info Alpha

The `$find` operation is currently in alpha. It supports only Schedules with a single actor and does not yet use `ActivityDefinition` default service type parameters.

:::

The `$find` operation returns a bundle of available (free) [`Slot`](/docs/api/fhir/resources/slot) resources for a given [`Schedule`](/docs/api/fhir/resources/schedule) within a specified time range. Slots are computed dynamically from the Schedule's [`SchedulingParameters`](/docs/scheduling/defining-availability) extension — no Slots need to be pre-generated.

## Use Cases

- **Patient-facing booking flows**: Show a patient the available time windows for a given provider or location
- **Availability checks**: Determine whether a provider has open time before attempting to book
- **Multi-provider scheduling**: Query multiple Schedules and intersect results to find shared availability

## Invoke the `$find` operation

```
[base]/R4/Schedule/[id]/$find
```

import Tabs from '@theme/Tabs';
import TabItem from '@theme/TabItem';

<Tabs>
<TabItem value="ts" label="TypeScript">

```typescript
import { MedplumClient } from '@medplum/core';
import type { Bundle, Parameters, Slot } from '@medplum/fhirtypes';

const medplum = new MedplumClient();

const result = await medplum.post(
  medplum.fhirUrl('Schedule', 'my-schedule-id', '$find'),
  {
    resourceType: 'Parameters',
    parameter: [
      { name: 'start', valueDateTime: '2026-03-10T09:00:00-05:00' },
      { name: 'end', valueDateTime: '2026-03-10T17:00:00-05:00' },
      // Optional: filter by service type (format: "system|code")
      { name: 'service-type', valueString: 'http://example.org/appointment-types|office-visit' },
      // Optional: limit number of results
      { name: '_count', valueInteger: 10 },
    ],
  }
) as Parameters;

const bundle = result.parameter?.[0]?.resource as Bundle<Slot>;
const slots = bundle.entry?.map((e) => e.resource as Slot) ?? [];
```

</TabItem>
<TabItem value="curl" label="cURL">

```bash
curl -X POST 'https://api.medplum.com/fhir/R4/Schedule/my-schedule-id/$find' \
  -H "Content-Type: application/fhir+json" \
  -H "Authorization: Bearer MY_ACCESS_TOKEN" \
  -d '{
    "resourceType": "Parameters",
    "parameter": [
      { "name": "start", "valueDateTime": "2026-03-10T09:00:00-05:00" },
      { "name": "end",   "valueDateTime": "2026-03-10T17:00:00-05:00" }
    ]
  }'
```

</TabItem>
</Tabs>

## Parameters

| Name           | Type       | Description                                                                                                                          | Required |
| -------------- | ---------- | ------------------------------------------------------------------------------------------------------------------------------------ | -------- |
| `start`        | `dateTime` | Start of the search window (inclusive)                                                                                               | Yes      |
| `end`          | `dateTime` | End of the search window (inclusive)                                                                                                 | Yes      |
| `service-type` | `string`   | Filter slots by service type. Format: `system\|code`. Multiple codes can be comma-separated. Omit to return all available service types. | No       |
| `_count`       | `integer`  | Maximum number of Slot resources to return. Defaults to 20. Maximum is 1000.                                                         | No       |

### Constraints

- `start` must be before `end`
- The search window cannot exceed **31 days**
- The Schedule must have exactly **one actor** reference
- The actor (Practitioner, Location, or Device) must have a timezone defined via the `http://hl7.org/fhir/StructureDefinition/timezone` extension

## Output

Returns a [`Parameters`](/docs/api/fhir/resources/parameters) resource wrapping a `Bundle` of `Slot` resources with `status: free`. The Slots are virtual — they are not persisted in the FHIR store.

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
              "resourceType": "Slot",
              "status": "free",
              "start": "2026-03-10T09:00:00.000Z",
              "end": "2026-03-10T10:00:00.000Z",
              "schedule": { "reference": "Schedule/my-schedule-id" }
            }
          },
          {
            "resource": {
              "resourceType": "Slot",
              "status": "free",
              "start": "2026-03-10T10:00:00.000Z",
              "end": "2026-03-10T11:00:00.000Z",
              "schedule": { "reference": "Schedule/my-schedule-id" }
            }
          }
        ]
      }
    }
  ]
}
```

When `service-type` is specified, each returned Slot will include the matching `serviceType` field.

## Availability Logic

`$find` calculates available windows by:

1. Reading the Schedule's `SchedulingParameters` extension to determine recurring availability windows, slot duration, buffer times, and alignment constraints
2. Fetching any existing Slot resources for the Schedule in the requested range (busy, busy-tentative, busy-unavailable, and free slots)
3. Subtracting occupied time (including buffer windows around booked slots) from the availability windows
4. Applying alignment intervals and offsets to produce valid start times
5. Returning Slots up to `_count`

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

## Related

- [Appointment `$book`](/docs/scheduling/appointment-book) - Book one of the returned Slots
- [Defining Availability](/docs/scheduling/defining-availability) - How to configure `SchedulingParameters` on a Schedule
- [Scheduling Overview](/docs/scheduling) - High-level scheduling concepts
- [`Schedule` resource](/docs/api/fhir/resources/schedule)
- [`Slot` resource](/docs/api/fhir/resources/slot)
