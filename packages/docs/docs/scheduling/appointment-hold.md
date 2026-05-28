import ExampleCode from '!!raw-loader!@site/../examples/src/scheduling/hold.ts';
import MedplumCodeBlock from '@site/src/components/MedplumCodeBlock';
import Tabs from '@theme/Tabs';
import TabItem from '@theme/TabItem';

# Appointment $hold

:::info[Alpha]

The `$hold` operation is currently in alpha.

:::

The `$hold` operation places a hold on one or more schedules by atomically creating an [`Appointment`](/docs/api/fhir/resources/appointment) and [`Slot`](/docs/api/fhir/resources/slot) resources. The operation validates that the requested time is genuinely available before committing.

## Booking Lifecycle

`$hold` is the second step in a three-step booking flow:

1. **[`$find`](/docs/scheduling/appointment-find)** — Query available time slots. Returns virtual `Appointment` resources with `contained` Slot resources.
2. **`$hold`** — Submit one of those virtual Appointments to reserve the time. Creates a real `Appointment` (status: `pending`) and `Slot` (status: `busy-tentative`).
3. **[`$confirm`](/docs/scheduling/appointment-confirm)** — Confirm the hold and transition the `Appointment` to `booked`.

## Use Cases

- **Patient self-serve booking**: Reserve a slot from `$find` results while the patient confirms their details, before committing to a booked appointment.
- **Multi-provider holds**: Atomically hold time across multiple schedules (e.g., surgeon + OR room) before requiring patient confirmation.
- **Unconfirmed booking flows**: Create a pending appointment that staff can review and confirm via `$book`.

## Invoke the `$hold` operation

```
[base]/R4/Appointment/$hold
```

<Tabs>
<TabItem value="ts" label="TypeScript">

<MedplumCodeBlock language="ts" selectBlocks="holdOne">
    {ExampleCode}
</MedplumCodeBlock>

</TabItem>
<TabItem value="curl" label="cURL">

```bash
curl -X POST 'https://api.medplum.com/fhir/R4/Appointment/$hold' \
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

| Name          | Type           | Description                                                                                                                                                    | Required |
| --------------| -------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------| -------- |
| `appointment` | `Appointment`  | An `Appointment` resource describing the desired appointment time. Must include `start`, `end`, and `serviceType`. Must have `Slot` resources in `contained`.  | Yes      |


### Constraints

- Each referenced Schedule must have exactly **one actor**
- Each actor must have a timezone defined via the `http://hl7.org/fhir/StructureDefinition/timezone` extension
- The requested time must match a valid slot duration from the Schedule's `SchedulingParameters`
- No existing busy Slots may overlap the requested time window (including buffer windows)
- The `serviceType` attribute must reference the HealthcareService you are trying to schedule via the `https://medplum.com/fhir/service-type-reference` extension
- The input `Appointment` must not already contain `slot` references (these are set by `$hold`)

The easiest way to meet these requirements is to use a result from a [`$find` operation](/docs/scheduling/appointment-find).

#### Schedule.Actor must have a TimeZone

Scheduling checks availability for each Actor with respect to their local time zone. For more details, see [Time Zones](/docs/scheduling/timezones).

```json
{
  "resourceType": "Practitioner",
  "extension": [
    {
      "url": "http://hl7.org/fhir/StructureDefinition/timezone",
      "valueCode": "America/New_York"
    }
  ]
}
```


#### `Appointment.serviceType` must reference a `HealthcareService`

Medplum Scheduling starts from a [`HealthcareService`](/docs/api/fhir/resources/healthcareservice) as a representation of a schedulable appointment type. Medplum Scheduling requires embedding a reference to the specific `HealthcareService` in an extension.

<details>
  <summary>Why this extension?</summary>

  While codes are a very flexible way to build connections to services, they also create a lot of opportunity for ambiguity. Medplum Scheduling has decided to use explicit references to specific HealthcareServices to resolve that tension.

  In FHIR R5+ the type of these `serviceType` fields is `CodeableReference(HealthcareService)`, meaning that it will eventually be valid to store a `Reference<HealthcareService>` in this attribute directly. In the meantime, in our FHIR R4 implementation we mimic this feature by using a custom extension.
</details>

```json
{
  "resourceType": "Appointment",
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
  ]
}

```

#### `Appointment.contained` holds virtual `Slot` resources

The `$hold` endpoint expects that its input describe exactly what slots should be created, including references to specific `Schedule` resources. The easiest way to construct a valid input is to pass an `Appointment` returned by [`$find`](/docs/scheduling/appointment-find) directly — `$find` already populates `contained` with the correct virtual Slot resources.

These slots will be removed from the `Appointment.contained` array when they are persisted to real `Slot` resources during `$hold`.

### Multi-Schedule Holds

Pass multiple virtual Slot resources in `Appointment.contained` to hold time across multiple Schedules atomically. All slots must share the same `start` and `end` time.

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
            "schedule": { "reference": "Schedule/dr-smith-schedule" },
            "start": "2026-03-11T08:00:00.000Z",
            "end": "2026-03-11T10:00:00.000Z"
          },
          {
            "resourceType": "Slot",
            "status": "busy",
            "schedule": { "reference": "Schedule/or-room-schedule" },
            "start": "2026-03-11T08:00:00.000Z",
            "end": "2026-03-11T10:00:00.000Z"
          }
        ]
      }
    }
  ]
}
```

## Output

Returns `201 Created` with a response body containing a `Bundle` of all persisted resources:

- One [`Appointment`](/docs/api/fhir/resources/appointment) with `status: "pending"`
- One `Slot` per contained slot parameter. Slots with status `"busy"` will be saved with status `"busy-tentative"`.

### Example Response

```json
{
  "resourceType": "Bundle",
  "type": "transaction-response",
  "entry": [
    {
      "resource": {
        "resourceType": "Appointment",
        "status": "pending",
        "start": "2026-03-14T16:00:00.000Z",
        "end": "2026-03-14T16:45:00.000Z",
        "participant": [
          {
            "actor": {
              "reference": "Practitioner/348708c1-6a8e-4405-b36b-93f590ed7948"
            },
            "status": "needs-action"
          }
        ],
        "serviceType": [
          {
            "extension": [
              {
                "url": "https://medplum.com/fhir/service-type-reference",
                "valueReference": {
                  "reference": "HealthcareService/23c3f1cc-4f55-4990-9775-511b02487e7e"
                }
              }
            ]
          }
        ],
        "slot": [
          {
            "reference": "Slot/52fbef8f-e9e6-4810-be53-e481649a72d8"
          }
        ],
        "id": "bdd87182-a05d-4ccc-ae7b-2ecd3f6049df",
        "meta": {
          "versionId": "0cb595fc-35d2-46be-9104-35332d6177e6",
          "lastUpdated": "2026-05-05T23:50:57.302Z"
        }
      }
    },
    {
      "resource": {
        "resourceType": "Slot",
        "start": "2026-03-14T16:00:00.000Z",
        "end": "2026-03-14T16:45:00.000Z",
        "schedule": {
          "reference": "Schedule/cc26e4b9-a92d-420c-873d-82e7d20152e7"
        },
        "status": "busy-tentative",
        "id": "52fbef8f-e9e6-4810-be53-e481649a72d8",
        "meta": {
          "versionId": "46689bb4-bc6d-4ac6-a917-cfe739a1ecd6",
          "lastUpdated": "2026-05-05T23:50:57.294Z"
        }
      }
    }
  ]
}
```

## Hold Logic

`$hold` performs the following steps atomically inside a database transaction:

1. Validates that each proposed Slot's start/end matches a valid slot duration defined in the Schedule's `SchedulingParameters`
2. Loads existing Slots in the time window (including buffer margins) for each Schedule
3. Checks that no existing busy Slot overlaps the requested time
4. Verifies the requested time falls within the Schedule's defined availability windows
5. Creates the `Appointment`, busy-tentative `Slot`(s), and any buffer `Slot`(s) atomically
6. Returns all created resources in the response Bundle

The transaction uses serializable isolation to prevent double-booking under concurrent requests.

## Error Responses

All error responses return HTTP 400 with an `OperationOutcome` body.

### Time Not Available

Returned when the requested time overlaps an existing busy Slot or falls outside the Schedule's defined availability windows.

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

### No Scheduling Parameters Found

```json
{
  "resourceType": "OperationOutcome",
  "issue": [{ "severity": "error", "code": "invalid", "details": { "text": "No SchedulingParameters found on Schedule or HealthcareService" } }]
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

- [Appointment `$find`](/docs/scheduling/appointment-find) - Find available Slots
- [Appointment `$confirm`](/docs/scheduling/appointment-confirm) - Transition Appointment.status from "pending" to "booked"
- [Appointment `$book`](/docs/scheduling/appointment-book) - Book an appointment in a single step (without a hold)
- [Defining Availability](/docs/scheduling/defining-availability) - How to configure `SchedulingParameters` on a Schedule
- [Scheduling Overview](/docs/scheduling) - High-level scheduling concepts
- [`Appointment` resource](/docs/api/fhir/resources/appointment)
- [`Slot` resource](/docs/api/fhir/resources/slot)
- [FHIR Transaction Bundles](/docs/fhir-datastore/fhir-batch-requests#batches-vs-transactions)

