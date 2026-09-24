---
sidebar_label: Appointment $find
sidebar_position: 2
---

# Appointment $find

:::info[Beta]

The `$find` operation is currently in [beta](/docs/compliance/alpha-beta).

:::

The `$find` operation takes a list of [`Schedule`](/docs/api/fhir/resources/schedule) references and a [`HealthcareService`](/docs/api/fhir/resources/healthcareservice) reference and returns a bundle of proposed [`Appointment`](/docs/api/fhir/resources/appointment) resources within a specified time range. Slots are computed dynamically from each [`SchedulingParameters`](/docs/scheduling/defining-availability) extensions on each Schedule and HealthcareService — no Slots need to be pre-generated.

Existing slots from each input Schedule are used to restrict or expand that schedule's availability, based on the slot's `status`.

## Use Cases

- **Patient-facing booking flows**: Show a patient the available time windows for a given provider or location
- **Availability checks**: Determine whether a provider has open time before attempting to book
- **Multi-provider scheduling**: Query multiple Schedules and intersect results to find shared availability
- **Recurring visits**: Find a weekly time that is open for every visit of a series. See [Finding a weekly series](#finding-a-weekly-series)

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
import type { Bundle, Appointment } from '@medplum/fhirtypes';

const medplum = new MedplumClient();

const url = medplum.fhirUrl('Appointment', '$find');
url.searchParams.append('start', '2026-03-10T09:00:00-05:00')
url.searchParams.append('end', '2026-03-10T17:00:00-05:00');
url.searchParams.append('service-type-reference', 'HealthcareService/my-healthcareservice-id')
url.searchParams.append('schedule', 'Schedule/my-schedule-id')
const bundle = await medplum.get<Bundle<Appointment>>(url);
const appointments = bundle.entry?.map((e) => e.resource as Appointment) ?? [];
```

</TabItem>
<TabItem value="curl" label="cURL">

```bash
curl -G 'https://api.medplum.com/fhir/R4/Appointment/$find' \
  -H "Authorization: Bearer MY_ACCESS_TOKEN" \
  --data-urlencode "start=2026-03-10T09:00:00-05:00" \
  --data-urlencode "end=2026-03-10T17:00:00-05:00" \
  --data-urlencode "service-type-reference=HealthcareService/my-healthcareservice-id" \
  --data-urlencode "schedule=Schedule/my-schedule-id"
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
| `ignore-appointment`     | `reference(Appointment)`         | Compute availability as if this Appointment did not exist. See [Reassigning an existing appointment](#reassigning-an-existing-appointment). | No       |
| `occurrence-count`       | `positiveInt`                    | Search for a weekly series of this many occurrences, from 2 to 6. See [Finding a weekly series](#finding-a-weekly-series). Defaults to 1, a single time. | No       |
| `_count`                 | `integer`                        | Maximum number of Appointment resources (or, with `occurrence-count`, series) to return. Defaults to 20. Maximum is 1000. | No       |

### Constraints

- `start` must be before `end`
- The search window cannot exceed **31 days**, or **7 days** when searching for a series
- `occurrence-count`, if provided, must be an integer between 1 and 6
- At least one schedule must be provided
- Each schedule must have exactly **one actor** reference
- Each schedule's `serviceType` field must match the requested HealthcareService.type
- Each schedule's actor (Practitioner, Location, or Device) must have a timezone defined via the `http://hl7.org/fhir/StructureDefinition/timezone` extension
- `ignore-appointment`, if provided, must reference an Appointment that exists and is readable by the caller, and cannot be combined with an `occurrence-count` of 2 or more

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


## Reassigning an existing appointment

When an appointment is moved to a different Schedule — say an 11am visit with Dr. Smith moves from
room one to room two — the appointment being moved is itself blocking the time you want to search
for. Dr. Smith's schedule is busy at 11am, but only because of the very appointment being
reassigned. A plain `$find` for Dr. Smith and room two would therefore not offer 11am.

Passing `ignore-appointment` computes availability as if that Appointment did not exist:

```
[base]/R4/Appointment/$find?...&schedule=Schedule/dr-smith-schedule&schedule=Schedule/room-two-schedule&ignore-appointment=Appointment/my-appointment-id
```

Every Slot referenced by `Appointment.slot` is discarded before availability is computed, including
the `busy-unavailable` buffer Slots created alongside the appointment. Slots belonging to *other*
appointments still block, even at the same time on the same Schedule — the parameter frees only the
time held by the one appointment it names.

:::caution

A time found with `ignore-appointment` cannot be committed with [`$book`](/docs/scheduling/appointment-book)
or [`$hold`](/docs/scheduling/appointment-hold). Those operations validate availability with the
original appointment's Slots still in place and will reject the request with
`Requested time slot is not available`. Use
[`$reschedule`](/docs/scheduling/appointment-reschedule) instead, which releases those Slots and
moves the appointment in a single transaction.

:::

## Finding a weekly series

Passing `occurrence-count` searches for a **weekly-recurring** series of appointment times instead of single times: a weekday and time of day that is available in every one of up to 6 consecutive weeks. Use it for physical therapy, counseling, or other care plans that repeat weekly for a fixed number of visits. Book the series you choose with [`$book`](/docs/scheduling/appointment-book#booking-a-weekly-series), which books every occurrence or none of them.

```
[base]/R4/Appointment/$find?start=2026-03-09T09:00:00-04:00&end=2026-03-09T17:00:00-04:00&service-type-reference=HealthcareService/my-healthcareservice-id&schedule=Schedule/my-schedule-id&occurrence-count=6
```

A series search differs from a single-time search in a few ways:

- `start`/`end` cover only the **first** occurrence, and cannot span more than **7 days**. That's tighter than the usual 31 days because each later occurrence is searched with a window of the same width. To search a later week, call `$find` again with that week's `start`/`end`.
- `_count` counts series. Each series is one entry of the response.
- `ignore-appointment` is not supported.

An `occurrence-count` of `1` (or none) is a single-time search.

### Series in the response

Each entry of the response is one series: a nested `collection` Bundle holding its proposed Appointments in occurrence order. Like any `$find` result, they are virtual. Pass a series' Appointments to `$book` together.

```json
{
  "resourceType": "Bundle",
  "type": "searchset",
  "entry": [
    {
      "resource": {
        "resourceType": "Bundle",
        "type": "collection",
        "entry": [
          { "resource": { "resourceType": "Appointment", "start": "2026-03-09T13:00:00.000Z", "...": "occurrence 1" } },
          { "resource": { "resourceType": "Appointment", "start": "2026-03-16T13:00:00.000Z", "...": "occurrence 2" } }
        ]
      }
    }
  ]
}
```

The nested Bundle is what groups a series, so proposed occurrences carry nothing else to say they belong together. [`$book`](/docs/scheduling/appointment-book#series-output) tags the series when it is booked.

### How a series is found

A 6-week series spans 35 days, which is longer than the 31-day limit on a single search window. So a series search never evaluates one wide multi-week window. Instead, it searches each occurrence's week separately:

1. Searches `start`/`end` exactly as a single-time search would, producing candidate start times for the first occurrence in chronological order
2. Searches each later week once, over the window those candidates project into
3. Keeps a candidate only if the same weekday and local time (in the schedules' shared `alignmentTimezone`) is available in **every** week
4. Returns the first `_count` candidates that survive every week

Each week is searched once, not once per candidate. The number of availability queries therefore scales with `occurrence-count`, not with how many candidate times the first week has.

Each occurrence is checked in its own calendar day in the alignment timezone, so the series keeps its local time of day across Daylight Saving Time transitions. A series anchored at 9am stays at 9am local time rather than at a fixed UTC offset. A series whose local time doesn't exist in some week, such as 2:30am on the night clocks spring forward, isn't offered. All of this holds **as long as `alignmentTimezone` is set to the schedule's real local timezone**. `alignmentTimezone` defaults to `Etc/UTC` (see [Defining Availability](/docs/scheduling/defining-availability)). In that case the series is fixed in UTC, and its local time will shift by an hour across a DST transition.

Recurrence is intentionally limited in this beta: **weekly only, up to 6 occurrences**. Monthly or yearly cadences, and skipped dates or other exceptions, are not yet supported.

## Availability Logic

`$find` calculates available windows by:

1. Reading each Schedule's `SchedulingParameters` extension to determine recurring availability windows, slot duration, buffer times, and alignment constraints
2. Fetching existing Slot resources for each Schedule in the requested range (busy, busy-tentative, busy-unavailable, and free slots)
3. Discarding the Slots held by `ignore-appointment`, if it was provided
4. Adding time for existing Slot resources with status `free`
5. Removing occupied time: `busy`, `busy-tentative`, and `busy-unavailable` slots block a time when the bookings covering it reach the strictest applicable limit — the requested `slotCapacity` or the tolerance of any booking already there (see [Overbooking](/docs/scheduling/defining-availability#overbooking)).
   :::note

   Under the default `slotCapacity` of 1, a single `busy` Slot is blocking. A capacity-1 booking is never offered for overbooking.

   :::
6. Applying alignment intervals and offsets to produce valid start times
7. Returning Appointments up to `_count`

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

### Series Range Exceeds 7 Days

```json
{
  "resourceType": "OperationOutcome",
  "issue": [{ "severity": "error", "code": "invalid", "details": { "text": "Search range cannot exceed 7 days" } }]
}
```

### Invalid occurrence-count

```json
{
  "resourceType": "OperationOutcome",
  "issue": [
    {
      "severity": "error",
      "code": "invalid",
      "details": { "text": "Invalid occurrence-count, must be an integer between 1 and 6" }
    }
  ]
}
```

### `ignore-appointment` with `occurrence-count`

```json
{
  "resourceType": "OperationOutcome",
  "issue": [
    {
      "severity": "error",
      "code": "invalid",
      "details": { "text": "ignore-appointment cannot be combined with occurrence-count" }
    }
  ]
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

### HealthcareService is inactive

```json
{
  "resourceType": "OperationOutcome",
  "issue": [{ "severity": "error", "code": "invalid", "details": { "text": "HealthcareService is inactive" } }]
}
```

## Beta Status

The Scheduling API is under active development. This [beta](/docs/compliance/alpha-beta) release of the scheduling API is expected to gain additional capabilities.

- `bookingLimit` - An upcoming scheduling parameter that will allow you to express how often a given service type may be added to a schedule. This is not yet enforced in `$find`.

## Related

- [Appointment `$book`](/docs/scheduling/appointment-book) - Book one of the returned Appointments
- [Appointment `$hold`](/docs/scheduling/appointment-hold) - Reserve one of the returned Appointments
- [Appointment `$reschedule`](/docs/scheduling/appointment-reschedule) - Move an existing Appointment to one of the returned times
- [Defining Availability](/docs/scheduling/defining-availability) - How to configure `SchedulingParameters` on a Schedule
- [Scheduling Overview](/docs/scheduling) - High-level scheduling concepts
- [`Schedule` resource](/docs/api/fhir/resources/schedule)
- [`Appointment` resource](/docs/api/fhir/resources/appointment)
- [`Slot` resource](/docs/api/fhir/resources/slot)
