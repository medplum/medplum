---
sidebar_label: Defining Availability (Alpha)
sidebar_position: 10
---

import ExampleCode from '!!raw-loader!@site/../examples/src/scheduling/defining-availability.ts';
import MedplumCodeBlock from '@site/src/components/MedplumCodeBlock';

# Defining Availability

:::info[Alpha]

Medplum Scheduling APIs are currently in [alpha](/docs/compliance/alpha-beta).

:::

This guide covers how to configure availability using the `SchedulingParameters` extension — at both the actor level (per Schedule) and the service type level (via HealthcareService). It covers scheduling constraints, field-level inheritance, override behavior, timezone handling, and multi-resource scheduling patterns.

Parameters may be defined on a HealthcareService and shared amongst all Schedules that book that type
of appointment. Each Schedule may also override these parameters to define behaviors specific to that
schedule as needed.

A few constraints trip people up most often — see [Common Pitfalls](#common-pitfalls) for a quick reference before you start.

The diagram below shows how availability can be defined at both
- The [actor level](/docs/scheduling/defining-availability#actor-level-availability) (via Schedule)
- The [service level](/docs/scheduling/defining-availability#service-level-availability) (via HealthcareService)

```mermaid
%%{init: {'theme':'base', 'themeVariables': {'fontSize':'14px'}, 'flowchart': {'useMaxWidth': false, 'htmlLabels': true}}}%%
graph TD
    C1[Practitioner<br/>*Dr. Smith*] --> B1
    A[HealthcareService<br/>*Initial Visit Defaults*<br/><br/><b>Service-level defaults</b><br/>ex. <i>1hr slot duration, 10min buffer</i><br/><i>Mon–Fri 9am–5pm availability</i>] -.->|inherited by| B1[Schedule<br/>*Dr. Smith's Schedule*<br/><br/><b>Actor-level overrides</b><br/>ex. <i>availability: Mon–Wed only</i>]
    A -.->|inherited by| B2[Schedule<br/>*Dr. Johnson's Schedule*<br/><br/><b>no overrides</b><br/><i>uses all service defaults</i>]
    C2[Practitioner<br/>*Dr. Johnson*] --> B2

    B1 --> D1[Slot<br/>*status: busy*]
    B1 --> D2[Slot<br/>*status: busy-unavailable*]
    B2 --> D3[Slot<br/>*status: busy*]
    B2 --> D4[Slot<br/>*status: busy-unavailable*]

    D1 --> E1[Appointment 1<br/>*status: booked*]
    D3 --> E2[Appointment 2<br/>*status: booked*]

    style A fill:#e1f5fe,stroke:#01579b,stroke-width:2px
    style B1 fill:#f3e5f5,stroke:#4a148c,stroke-width:2px
    style B2 fill:#f3e5f5,stroke:#4a148c,stroke-width:2px
    style C1 fill:#fce4ec
    style C2 fill:#fce4ec
    style D1 fill:#fff3e0
    style D2 fill:#fff3e0
    style D3 fill:#fff3e0
    style D4 fill:#fff3e0
    style E1 fill:#e8f5e8
    style E2 fill:#e8f5e8
```

## The Scheduling Parameters Extension

All scheduling constraints are managed through a single consolidated extension: `SchedulingParameters`. This extension can appear on both [HealthcareService](/docs/api/fhir/resources/healthcareservice) (for shared configuration) and [Schedule](/docs/api/fhir/resources/schedule).

To use scheduling APIs for a Schedule and HealthcareService, at least one of them must define the `duration` attribute (used to set how long the scheduled appointment will last). There must be a `timezone` attribute, which may also be defined on the Schedule's actor. (See [Timezone Resolution](#timezone-resolution))

When using scheduling APIs to interact with multiple `Schedule` resources at once, they must be configured with matching `duration`, `alignmentInterval`, `alignmentTimezone`, and `alignmentOffset` parameters. For this reason, Medplum recommends that these parameters only be set on `HealthcareService` resources.

#### Extension Fields

| Url                 | Type                                                        | Default Value                               | Description                                                                                                                                                             | `HealthcareService` usage notes                               | `Schedule` usage notes                                    |
| ------------------- | ----------------------------------------------------------- | ------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------- | --------------------------------------------------------- |
| `duration`          | [Duration](/docs/api/fhir/datatypes/duration)               | *none*                                      | Determines how long the time increments for a Slot are                                                                                                                  |                                                               | Recommended to prefer setting this on `HealthcareService` |
| `timezone`          | Code                                                        | *none*                                      | Specifies the timezone (IANA timezone identifier, e.g., `America/New_York`) for interpreting availability. When not set, falls back to the `Schedule.actor`'s timezone. |                                                               |                                                           |
| `bufferBefore`      | [Duration](/docs/api/fhir/datatypes/duration)               | 0 minutes (no buffer needed)                | Sets prep-time needed before appointment start. It must be free at booking time, and will be reserved with a Slot.                                                      |                                                               |                                                           |
| `bufferAfter`       | [Duration](/docs/api/fhir/datatypes/duration)               | 0 minutes (no buffer needed)                | Sets cleanup time needed after appointment end. It must be free at booking time, and will be reserved with a Slot.                                                      |                                                               |                                                           |
| `alignmentInterval` | [Duration](/docs/api/fhir/datatypes/duration)               | 60 minutes (appointments start on-the-hour) | Start times must align to this interval (e.g., every 15 minutes)                                                                                                        |                                                               | Recommended to prefer setting this on `HealthcareService` |
| `alignmentOffset`   | [Duration](/docs/api/fhir/datatypes/duration)               | 0 minutes                                   | Shifts allowed start times by this offset (e.g., with a 15-minute alignmentInterval and a 5-minute alignmentOffset, valid starts are :05, :20, :35, :50)                |                                                               | Recommended to prefer setting this on `HealthcareService` |
| `alignmentTimezone` | Code                                                        | 'Etc/UTC'                                   | Anchors the alignment grid to local midnight of the given timezone, keeping start times stable across DST transitions.                                                  |                                                               | Recommended to prefer setting this on `HealthcareService` |
| `service`           | `Reference(HealthcareService)`                              | *none*                                      | Pointer to the `HealthcareService` that these parameters  should override.                                                                                              | Not permitted                                                 |                                                           |
| `availability`      | [Nested Extension](#availability-extension)                 | Always available                            | Weekly recurring availability windows. When set, appointments must fit inside these windows.                                                                            | Not permitted (use `HealthcareService.availableTime` instead) |                                                           |

<details>
<summary>Example of the `SchedulingParameters` extension on a `HealthcareService`</summary>

<MedplumCodeBlock language="ts" selectBlocks="schedulingParamsHealthcareService">
  {ExampleCode}
</MedplumCodeBlock>

</details>


<details>
<summary>Example of the `SchedulingParameters` extension on a `Schedule`</summary>

<MedplumCodeBlock language="ts" selectBlocks="schedulingParamsSchedule">
  {ExampleCode}
</MedplumCodeBlock>

</details>

### Alignment grid

Medplum Scheduling APIs generate possible appointments by projecting a repeating daily grid. These parameters control that grid:

| Parameter           | Description                            | Default    |
| ------------------- | -------------------------------------- | ---------- |
| `alignmentInterval` | How frequently slot start times occur  | 60 minutes |
| `alignmentOffset`   | Shifts slot start times by this amount | 0 minutes  |
| `alignmentTimezone` | What timezone the grid is anchored to  | `Etc/UTC`  |

#### `alignmentInterval`

Sets how frequently appointments may begin. For back-to-back scheduling without gaps, set this value to match the `duration` parameter.

#### `alignmentOffset`

Example: to align your appointments starting at 9:15, 10:15, ..., set `alignmentOffset` to 15 minutes (with a 60-minute `alignmentInterval`).

#### `alignmentTimezone`

When clocks change for DST, slots appear to shift by an hour in local time — for example, a 9:00am slot may appear at 8:00am or 10:00am. Setting `alignmentTimezone` anchors the grid to local midnight instead, keeping slot times consistent year-round.

**Relationship to `timezone`:** The two fields serve distinct purposes and can be set independently:
- `timezone` — which timezone to use when reading `availableStartTime`/`availableEndTime` values
- `alignmentTimezone` — which timezone's midnight to use as the alignment grid anchor

The rare case in which they differ: a provider whose availability hours and appointment grid are managed in different timezones.

## Actor Level Availability

Actor-level availability is defined per [`Schedule`](/docs/api/fhir/resources/schedule) and is resolved **field-by-field against** the [service-level parameters](#service-level-availability) on the [HealthcareService](/docs/api/fhir/resources/healthcareservice):

- For each parameter (`duration`, buffers, alignment, **and `availability`**), the value set on the Schedule **overrides** the HealthcareService value for that field; any field the Schedule does not set is **inherited** from the service. This is an override, not a merge — a Schedule that sets its own `availability` fully replaces the service's `availableTime`, rather than narrowing it. See [Override Behavior](#override-behavior) for the full resolution order.
- A separate **intersection** applies only when [booking across multiple Schedules at once](#example-3-location-specific-complex-surgical-scheduling) (e.g. surgeon + room + anesthesiologist): a time is offered only when *every* required Schedule is available. That intersection is between Schedules — not between a Schedule and its HealthcareService.

### The Concept of Implicit Availability

Medplum's scheduling model uses **implicit availability**: time is assumed to be free by default. You define availability rules using extensions that specify when resources are available based on recurring patterns. [`Slot`](/docs/api/fhir/resources/slot) resources are only used for explicit overrides—either to mark time as busy (when an appointment is booked) or to block out unavailable time.

This approach avoids the need to pre-generate thousands of Slot resources for every possible time slot. Instead, the system calculates available windows dynamically based on the availability rules you define.

### The Schedule Resource

The [`Schedule`](/docs/api/fhir/resources/schedule) resource is the foundation for defining actor-level availability for a provider, location, or device.

The Schedule resource should define the service types that it is capable of acting on in its `serviceType` attribute.

:::note[`Schedule` has no `name` element]

In FHIR R4, [`Schedule`](/docs/api/fhir/resources/schedule) has no `name` element. This is easy to trip over because `Organization`, `HealthcareService`, and `Location` all *do* have `name`. Sending `name` on a `Schedule` fails validation with `Invalid additional property "name"`.

Instead, use `comment` — a free-text field that's a good place for a human-readable description or label (for example, `"Dr. Smith's Office Visit availability"`).

:::

#### Choosing the actor: `Practitioner` vs `PractitionerRole`

`Schedule.actor` may reference a [`Practitioner`](/docs/api/fhir/resources/practitioner), [`PractitionerRole`](/docs/api/fhir/resources/practitionerrole), [`Location`](/docs/api/fhir/resources/location), or [`Device`](/docs/api/fhir/resources/device). When the actor is a person:

- Use **`Practitioner`** when availability is for the individual regardless of role or location.
- Use **`PractitionerRole`** when availability is specific to a role, organization, or location binding (for example, when licensure varies by state — see [state-by-state licensure](/docs/scheduling/state-by-state-licensure)).

In all cases the referenced actor (Practitioner, PractitionerRole, Location, or Device) must carry the FHIR timezone extension (`http://hl7.org/fhir/StructureDefinition/timezone`). Pick one convention per example and use it consistently for both the `actor` reference and any related text.

Here is an example of a [Schedule](/docs/api/fhir/resources/schedule) resource that defines availability for a [Practitioner](/docs/api/fhir/resources/practitioner).

<MedplumCodeBlock language="ts" selectBlocks="scheduleResource">
  {ExampleCode}
</MedplumCodeBlock>

### `availability` Extension

The `availability` sub-extension mirrors the FHIR R5+ [`Availability`](https://hl7.org/fhir/R5/metadatatypes.html#Availability) datatype shape.  It is encoded using nested R4 extensions (because R4 does not have a native `Availability` data type).  This is close to the R4 definition of `HealthcareService.availabileTime`, which is another possible source of scheduling availability data. If this sub-extension is not present, availability is constrained only by the presence of existing `Slot` resources for the schedule.

| Sub-extension         | Type          | Description                                          | Repeatable |
| --------------------- | ------------- | ---------------------------------------------------- | ---------- |
| `availableTime`       | (nested)      | One entry per availability window                    | Yes        |
| ↳ `daysOfWeek`        | `valueCode`   | One entry per day (`mon`–`sun`)                      | Yes        |
| ↳ `allDay`            | `valueBoolean`| If `true`, window spans the full day                 | No         |
| ↳ `availableStartTime`| `valueTime`   | Opening time (not allowed  when `allDay` is present) | No         |
| ↳ `availableEndTime`  | `valueTime`   | Closing time (not allowed  when `allDay` is present) | No         |
| `notAvailableTime`    | (nested)      | Typed for future use; not yet processed              | Yes        |

<MedplumCodeBlock language="ts" selectBlocks="scheduleAvailability">
  {ExampleCode}
</MedplumCodeBlock>

## Service Level Availability

### Service Types and HealthcareService

A [HealthcareService](/docs/api/fhir/resources/healthcareservice) gives a mechanism to define common scheduling parameters for an appointment type, which can then be used by multiple [Practitioner](/docs/api/fhir/resources/practitioner)'s [Schedules](/docs/api/fhir/resources/schedule). This allows you to define standard appointment durations, buffer times, alignment intervals, and booking limits once and apply them across multiple providers.

In Medplum scheduling, **one HealthcareService represents one bookable appointment type** (e.g. "Office Visit", "New Patient Visit", "Bariatric Surgery"). It is the place where the shared `SchedulingParameters` extension lives, so the same `duration`, buffers, and alignment apply everywhere the type is booked.

#### Coding a HealthcareService

A `HealthcareService` carries several `CodeableConcept` fields. The most relevant for scheduling is `type` (the specific appointment/service type that the `Schedule.serviceType` matches against). The full set:

| Field       | Meaning                                  | Conventional code system                                                                                                                  |
| ----------- | ---------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------- |
| `category`  | Broad category of service                | HL7 [`service-category`](https://hl7.org/fhir/R4/valueset-service-category.html)                                                          |
| `type`      | The specific service / appointment type  | HL7 [`service-type`](https://hl7.org/fhir/R4/valueset-service-type.html), or [SNOMED CT](https://www.snomed.org/) procedure codes         |
| `specialty` | Clinical specialties handled by the site | [SNOMED CT](https://www.snomed.org/) practice-setting codes ([c80-practice-codes](https://hl7.org/fhir/R4/valueset-c80-practice-codes.html)) |

These bindings are **example/preferred, not required** — FHIR does not force a particular terminology here. You can use a code from the HL7 `service-type` value set, a SNOMED CT code (as the surgical examples below do), or your own local system (as the `http://example.org/appointment-types` examples below do). What matters is that the same code/system you put on `HealthcareService.type` is what the `Schedule.serviceType` declares and what `$find` is queried with.

:::note[LOINC is not used here]

LOINC codes describe observations, lab tests, and documents — not services. Use the HL7 `service-type`/`service-category` systems or SNOMED CT for a `HealthcareService`, not LOINC.

:::

For a `Schedule` to use the `HealthcareService`'s scheduling parameters, the `Schedule.serviceType` must include a reference to the HealthcareService in its extensions.

<MedplumCodeBlock language="ts" selectBlocks="healthcareServiceServiceLevel">
  {ExampleCode}
</MedplumCodeBlock>

<MedplumCodeBlock language="ts" selectBlocks="scheduleServiceTypeLink">
  {ExampleCode}
</MedplumCodeBlock>

### Override Behavior

A [Practitioner](/docs/api/fhir/resources/practitioner)'s [Schedule](/docs/api/fhir/resources/schedule) can override individual scheduling parameters for a specific service type by adding a `SchedulingParameters` extension that references that service. **Only the fields explicitly set on the Schedule override the HealthcareService defaults** — all other fields are inherited.

This means you only need to specify what differs. For example, to restrict availability to Tuesday and Thursday mornings while keeping all other parameters (duration, buffers, alignment) from the HealthcareService:

<MedplumCodeBlock language="ts" selectBlocks="scheduleOverride">
  {ExampleCode}
</MedplumCodeBlock>

**Field-level inheritance**: When a Schedule has a `SchedulingParameters` extension for a service, each field is resolved independently using this priority order (highest to lowest):

1. The field value from the Schedule's `SchedulingParameters` extension for that service
2. The field value from the HealthcareService's `SchedulingParameters` extension
3. The system default (0 for buffers and offset; 60 minutes for alignment interval; always-available for availability)
4. Per-actor timezone information (via `Schedule.actor`; only for `timezone` attribute)

If a Schedule has **no** `SchedulingParameters` extension at all, all parameters are inherited from this chain.

### Blocking Time by Service Type

Here is an example of a [Slot](/docs/api/fhir/resources/slot) resource that blocks time for a specific service type.

<MedplumCodeBlock language="ts" selectBlocks="slotBlocking">
  {ExampleCode}
</MedplumCodeBlock>

- **With serviceType**: Blocks only that specific service
- **Without serviceType**: Blocks all services

## Timezone Resolution

### Timezone per Scheduling Parameters Entry

The `timezone` parameter allows you to specify different timezones for different service types within the same Schedule. This is useful when a provider needs to define availability in different timezones for different services (e.g., a doctor who provides cardiac surgery where they might travel to in one time zone and call center availability in another time zone).

**Fallback Logic:** If no time zone is specified in the `scheduling-parameters` extension, then the availability will be interpreted in the time zone defined on the Schedule's actor reference (Practitioner, Location, or Device). It looks for the FHIR sanctioned time zone extension:

:::tip[Adding a Timezone to an Actor]

There is no native timezone field on [`Practitioner`](/docs/api/fhir/resources/practitioner), [`Location`](/docs/api/fhir/resources/location), or [`Device`](/docs/api/fhir/resources/device), so you must add it via the FHIR timezone extension:

<MedplumCodeBlock language="ts" selectBlocks="actorTimezone">
  {ExampleCode}
</MedplumCodeBlock>

:::


**Timezone Resolution Order:**

1. If `timezone` is specified in the `scheduling-parameters` extension, use that time zone
2. Otherwise, fall back to the time zone defined on the Schedule's actor reference (Practitioner, Location, or Device)

**Important Notes:**

- The time zone value should be an IANA time zone identifier (e.g., `America/New_York`, `America/Los_Angeles`, `America/Miami`)
- When `timezone` is specified, all Time values in the `availability` extension are interpreted in that time zone

Here is an example of a Schedule with multiple service types, each with its own time zone:

<MedplumCodeBlock language="ts" selectBlocks="multiTimezoneSchedule">
  {ExampleCode}
</MedplumCodeBlock>

In this example:

- Cardiac surgery availability is defined in `America/Los_Angeles` time zone (Mon-Wed 11am-3pm America/Los Angeles)
- Call Center availability is defined in `America/New_York` time zone (Mon-Wed 9am-5pm Eastern)
- Each service type's availability times are interpreted independently based on their respective timezones

## Examples

### Example 1: Simple Primary Care Office with Appointment Type Defaults

This example shows how to define availability for a simple primary care office where Practitioner's Schedules inherit default scheduling parameters from an HealthcareService.

<details>
<summary>HealthcareService: Office Visit Defaults</summary>

This HealthcareService defines default scheduling parameters for a 30-minute office visit with 5-minute buffers and 15-minute alignment intervals.

<MedplumCodeBlock language="ts" selectBlocks="officeVisitService">
  {ExampleCode}
</MedplumCodeBlock>

</details>

<details>
<summary>Schedule: Practitioner's Schedule without Overrides</summary>

This Schedule shows Dr. Johnson's availability (Mon-Fri 9am-5pm) that inherits all default parameters from the HealthcareService without any service-specific overrides.

<MedplumCodeBlock language="ts" selectBlocks="drJohnsonSchedule">
  {ExampleCode}
</MedplumCodeBlock>

</details>

**Result**: Dr. Johnson's schedule inherits all the default parameters from the HealthcareService for an office visit:

- $find called with `service-type=office-visit`: For office visits, available to start every 15 minutes (:00, :15, :30, :45) with 5-minute buffers **[from HealthcareService]**

```mermaid
%%{init: {'theme':'base', 'themeVariables': {'fontSize':'14px'}, 'flowchart': {'useMaxWidth': false, 'htmlLabels': true}}}%%
graph TD
    A[HealthcareService<br/>*Office Visit Defaults*] -.-> B[Schedule<br/>*Dr. Johnson's Schedule*]
    C[Practitioner<br/>*Dr. Sarah Johnson*] --> B

    B --> D[Slot<br/>*status: busy*]

    subgraph "Booking"
        D --> E[Appointment<br/>*status: booked*]
    end

    style A fill:#e1f5fe
    style B fill:#f3e5f5
    style C fill:#fce4ec
    style D fill:#fff3e0
    style E fill:#e8f5e8
```

### Example 2: Multi-Service Provider with Multiple Appointment Types and Overrides

A provider who offers different appointment types with varying availability and constraints. Overrides the default scheduling parameters for new patient visits.

<details>
<summary>HealthcareService: New Patient Visit</summary>

This HealthcareService defines a 60-minute new patient visit with 15-minute buffers, 30-minute alignment intervals, and a booking limit of 3 per day.

<MedplumCodeBlock language="ts" selectBlocks="newPatientService">
  {ExampleCode}
</MedplumCodeBlock>

</details>

<details>
<summary>HealthcareService: Follow-up Visit</summary>

This HealthcareService defines a 20-minute follow-up visit with 5-minute buffers and 10-minute alignment intervals for more frequent scheduling.

It defines default availability of Monday-Friday, 9am-5pm.

<MedplumCodeBlock language="ts" selectBlocks="followUpService">
  {ExampleCode}
</MedplumCodeBlock>

</details>

<details>
<summary>Schedule: Multi-Service with Overrides</summary>

This schedule declares in its `serviceType` array that it can be booked for New Patient visits and Follow-Up visits.

This Schedule will use the default availability for the "Follow-Up" service (Mon-Fri 9am-5pm). It will override "New Patient Visit" appointment type to only be available on Tuesday and Thursday mornings (9am-1pm).

<MedplumCodeBlock language="ts" selectBlocks="multiServiceSchedule">
  {ExampleCode}
</MedplumCodeBlock>

</details>

**Result**:

- **New patient visits (ie. `$find` with the "New patient visit" HealthcareService)**: Tue/Thu 9am-1pm only, 60 minutes, can start every 30 minutes, 15-min buffers
- **Follow-ups (ie. `$find` called with the "Follow-up visit" HealthcareService)**: Mon-Fri 9am-5pm, 20 minutes, can start every 10 minutes, 5-min buffers

```mermaid
%%{init: {'theme':'base', 'themeVariables': {'fontSize':'14px'}, 'flowchart': {'useMaxWidth': false, 'htmlLabels': true}}}%%
graph TD
    A1[HealthcareService<br/>*New Patient Visit*] -. overridden on<br/>Schedule .-> B[Schedule<br/>*Dr. Chen's Schedule*]
    A2[HealthcareService<br/>*Follow-up Visit*] -.-> B
    C[PractitionerRole<br/>*Dr. Chen*] --> B

    B --> D1[Slot<br/>*status: busy*<br/>new patient]

    subgraph "Booking"
        D1 --> E1[Appointment<br/>*status: booked*]
    end

    style A1 fill:#e1f5fe
    style A2 fill:#e1f5fe
    style B fill:#f3e5f5
    style C fill:#fce4ec
    style D1 fill:#fff3e0
    style E1 fill:#e8f5e8
```

### Example 3: Location-Specific Complex Surgical Scheduling

A bariatric surgery requiring surgeon, OR room, and anesthesiologist coordination.

<details>
<summary>HealthcareService: Bariatric Surgery</summary>

This HealthcareService defines scheduling for a 120-minute surgical procedure with 45/30-minute buffers and multiple booking limits (2 per day, 8 per week).

<MedplumCodeBlock language="ts" selectBlocks="bariatricService">
  {ExampleCode}
</MedplumCodeBlock>

</details>

<details>
<summary>Schedule: Surgeon Availability</summary>

This Schedule shows Dr. Martinez's availability for bariatric surgeries, limited to Tuesday and Thursday mornings (8am-4pm).

<MedplumCodeBlock language="ts" selectBlocks="surgeonSchedule">
  {ExampleCode}
</MedplumCodeBlock>

</details>

<details>
<summary>Schedule: Operating Room Availability</summary>

This Schedule shows Operating Room 3's availability for surgical procedures, available weekdays 7am-7pm with extended 12-hour blocks.

<MedplumCodeBlock language="ts" selectBlocks="operatingRoomSchedule">
  {ExampleCode}
</MedplumCodeBlock>

</details>

<details>
<summary>Schedule: Anesthesiologist Availability</summary>

This Schedule shows Dr. Kim's availability for surgical procedures, covering weekdays 7am-5pm (10-hour blocks).

<MedplumCodeBlock language="ts" selectBlocks="anesthesiologistSchedule">
  {ExampleCode}
</MedplumCodeBlock>

</details>

**Result**: When booking a bariatric surgery, the system queries all three schedules, calculates the intersection of availability, and creates atomic transaction bundles to book all required resources simultaneously.

```mermaid
%%{init: {'theme':'base', 'themeVariables': {'fontSize':'14px'}, 'flowchart': {'useMaxWidth': false, 'htmlLabels': true}}}%%
graph TD
    A[HealthcareService<br/>*Defaults for<br/>Bariatric Surgery*] -.-> B1[Schedule<br/>*Operating Room 3's<br/>Schedule*]
    A -.-> B2[Schedule<br/>*Surgeon Martinez's<br/>Schedule*]
    A -.-> B3[Schedule<br/>*Anesthesiologist Kim's<br/>Schedule*]

    C1[Location<br/>*Operating Room 3*] --> B1
    C2[Practitioner<br/>*Surgeon Martinez*] --> B2
    C3[Practitioner<br/>*Anesthesiologist Kim*] --> B3

    B1 --> D1[Slot<br/>*status: busy*]
    B2 --> D2[Slot<br/>*status: busy*]
    B3 --> D3[Slot<br/>*status: busy*]

    subgraph "Transaction Bundle"
        D1 --> E1[Appointment 1<br/>*status: booked*]
        D2 --> E1
        D3 --> E1
    end

    style A fill:#e1f5fe
    style B1 fill:#f3e5f5
    style B2 fill:#f3e5f5
    style B3 fill:#f3e5f5
    style C1 fill:#fff3e0
    style C2 fill:#fce4ec
    style C3 fill:#fce4ec
    style D1 fill:#fff3e0
    style D2 fill:#fff3e0
    style D3 fill:#fff3e0
    style E1 fill:#e8f5e8
```

### Example 4: Canonical Seed Bundle — One Service, Multiple Practitioners and Rooms

This is a complete, uploadable seed bundle for the common case of a single service (here, a "Surgical Procedure") that is bookable across multiple practitioners and rooms. It is the recommended starting point for configuring a multi-schedule setup.

It demonstrates the patterns from [Common Pitfalls](#common-pitfalls):

- **`type: transaction`** so a single bad entry rolls back the whole bundle (see [Seeding configuration](#4-seed-configuration-with-a-transaction-bundle-not-batch)).
- **`urn:uuid` `fullUrl`s** so resources can cross-reference each other before they have server-assigned IDs.
- **`comment`, not `name`,** on each `Schedule`.
- **`Practitioner`/`Location` actors each carrying a timezone extension.**
- **`ifNoneExist`** on the `Organization` so re-running the seed is idempotent.

Each `Schedule` sets only its own `availability` and inherits `duration`, buffers, and alignment from the `HealthcareService`. Add more practitioners or rooms by duplicating the Practitioner/Location + Schedule pair.

:::note

The service code below uses a placeholder `http://example.org/appointment-types` system. Replace it with a real SNOMED CT or CPT code before using this in production.

:::

<MedplumCodeBlock language="ts" selectBlocks="seedBundle">
  {ExampleCode}
</MedplumCodeBlock>

## Location Modeling

### Location Hierarchy Pattern

```
Organization (Surgery Center)
  └─ Location (Building) [mode=kind]
       ├─ Location (Operating Rooms) [mode=kind, type=OR]
       │    ├─ Location (OR-1) [mode=instance]
       │    ├─ Location (OR-2) [mode=instance]
       │    └─ Location (OR-3) [mode=instance]
       └─ Location (Recovery Rooms) [mode=kind, type=RR]
            ├─ Location (Recovery-A) [mode=instance]
            └─ Location (Recovery-B) [mode=instance]
```

### Specific vs. "Any Available" Room

**Specific room required:**

- Query `Schedule?actor=Location/or-3`

**Any OR room acceptable:**

- Query: `Schedule?actor:Location.partof:Location.type=OR`

```mermaid
%%{init: {'theme':'base', 'themeVariables': {'fontSize':'14px'}, 'flowchart': {'useMaxWidth': false, 'htmlLabels': true}}}%%
graph TD
    A[Location<br/>*Operating Rooms*<br/>mode=kind, type=OR] --> B1[Location<br/>*OR-1*<br/>mode=instance]
    A --> B2[Location<br/>*OR-2*<br/>mode=instance]
    A --> B3[Location<br/>*OR-3*<br/>mode=instance]

    B1 --> C1[Schedule<br/>*OR-1 Schedule*]
    B2 --> C2[Schedule<br/>*OR-2 Schedule*]
    B3 --> C3[Schedule<br/>*OR-3 Schedule*]
```

### Best Practices

#### 1. Set Defaults on HealthcareService, Override Only What Differs on Schedule

Define `duration`, buffers, and alignment once on the HealthcareService. Only add a `SchedulingParameters` extension to a Schedule when that actor's availability or parameters differ from the service defaults. Omit any field that should be inherited.

#### 2. Minimize Pre-Generated Slots

Only create Slot resources for:

- Booked appointments (status: busy)
- Blocked time (status: busy-unavailable)

Let `$find` calculate available windows dynamically.

#### 3. Transaction Bundles for Multi-Resource Booking

Always use [FHIR transaction bundles](/docs/fhir-datastore/fhir-batch-requests#batches-vs-transactions) when booking appointments that require multiple resources to ensure atomicity.

#### 4. Seed Configuration with a `transaction` Bundle, not `batch`

Seed schedules with a [`transaction`](/docs/fhir-datastore/fhir-batch-requests#batches-vs-transactions) bundle, not `batch`. In a `batch`, each entry commits independently: if one entry fails validation, the rest still commit and the failure may not be obvious, leaving a partially-built configuration (and potentially an orphaned `Slot` pointing at a `Schedule` that was never created). A `transaction` is atomic, so a single bad entry rolls back the whole bundle and surfaces the error.

Use `ifNoneExist` on seed entries to make re-runs idempotent (conditional create), so seeding twice does not create duplicates:

```json
{
  "request": {
    "method": "POST",
    "url": "Organization",
    "ifNoneExist": "identifier=http://example.org/organizations|bayview-surgery-center"
  }
}
```

See [Example 4](#example-4-canonical-seed-bundle--one-service-multiple-practitioners-and-rooms) for a complete, validated seed bundle.

## Common Pitfalls

A few constraints trip people up most often when configuring availability:

- **`Schedule` has no `name` element** in FHIR R4. Use `comment` for a human-readable label — sending `name` fails validation with `Invalid additional property "name"`. See [The Schedule Resource](#the-schedule-resource).
- **Seed configuration with a `transaction` bundle, not `batch`.** A `batch` commits good entries and silently drops bad ones with no rollback, which can leave a partially-built configuration and orphaned `Slot`s. See [Seeding configuration](#4-seed-configuration-with-a-transaction-bundle-not-batch).
- **Every actor must carry a timezone extension** (`http://hl7.org/fhir/StructureDefinition/timezone`). See [Timezone Resolution](#timezone-resolution).
- **A Schedule's parameters override, they don't merge.** Setting `availability` on a Schedule fully replaces the service's `availableTime` rather than narrowing it. See [Override Behavior](#override-behavior).
- **To book across multiple schedules at once**, `duration`, `alignmentInterval`, `alignmentOffset`, and `alignmentTimezone` must match across them. Prefer setting these only on the `HealthcareService`.
