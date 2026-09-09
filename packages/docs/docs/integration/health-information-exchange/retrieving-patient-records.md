---
sidebar_position: 3
description: Run a production-only Patient360 retrieval, review selective inventories, and follow the import Task.
tags: [integration, hie]
---

# Retrieve Patient Records from an HIE

:::caution[Production-only integration]
Patient360 retrieval is available only in production at this time. Health Gorilla has not yet provided
a sandbox workflow for end-to-end testing. Coordinate enablement and the first controlled production
retrieval with Medplum before exposing these operations to users.
:::

A new patient may arrive with years of history that your team cannot see yet. A Patient360 retrieval
asks participating exchange networks for that history. Your application can either import every
supported record automatically or let a clinician review an inventory before importing selected
records.

Both workflows run asynchronously and use a FHIR [`Task`](/docs/api/fhir/resources/task). The Task
records the requested mode, current phase, manifest references, counts, and final result.

:::info[Before you begin]
Patient360 must be enabled for your production project by Medplum, and the patient must have complete
matching demographics. If you are still planning the rollout, start with
[Getting Started](/docs/integration/health-information-exchange/getting-started).
:::

## Patient matching requirements

Accurate demographics improve patient matching and prevent low-quality or empty network queries. Both
operations validate the saved Medplum `Patient` before starting a billable retrieval.

The patient must have:

- A name containing both `given` and `family`.
- `birthDate`.
- A known `gender` value.
- An address with `postalCode`.
- Either a phone or email in `telecom`, or a complete street address with `line`, `city`, `state`, and
  `postalCode`.

The operation reads the latest saved version of the `Patient`. Unsaved demographics supplied only in
the request body are not used.

```json
{
  "resourceType": "Patient",
  "id": "example",
  "name": [{ "family": "Example", "given": ["Taylor"] }],
  "birthDate": "1985-04-23",
  "gender": "female",
  "address": [
    {
      "line": ["100 Main Street"],
      "city": "San Francisco",
      "state": "CA",
      "postalCode": "94105"
    }
  ]
}
```

:::warning[Each retrieval is a live network request]
There is no Patient360 sandbox workflow. Start a retrieval only after production enablement, for an
authorized patient and the permitted treatment purpose. Each retrieval is a metered network request.
:::

## Choose a retrieval workflow

Do not silently default users into a mode. Present two explicit choices and require a fresh treatment
attestation before either request.

### Import all records

Use import-all when every supported record should be written to the chart automatically:

```http
POST [base]/fhir/R4/Patient/{id}/$health-gorilla-hie-p360-import-all
Authorization: Bearer [access-token]
Content-Type: application/fhir+json

{}
```

Using the Medplum SDK:

```ts
const outcome = await medplum.post(medplum.fhirUrl('Patient', patient.id, '$health-gorilla-hie-p360-import-all'), {});
```

After acknowledgement, no further user action is required. The Task moves from
`in-progress / retrieving` to `completed` when ingestion finishes. The managed worker that processes
the automatic result is named `p360-ingest-all`.

### Choose records to import

Use selective retrieval when a clinician should review the discovered inventory before clinical data
is written:

```http
POST [base]/fhir/R4/Patient/{id}/$health-gorilla-hie-p360-import-selective
Authorization: Bearer [access-token]
Content-Type: application/fhir+json

{}
```

The Task first moves through `in-progress / retrieving`. When its status is `ready` and its business
phase is `awaiting-selection`, no clinical records have been imported. The Task outputs reference one
or more snapshot `List` resources containing the review inventory.

Only follow local `List/{id}` references coded `p360-selection-manifest`. Each List entry carries the
selectable `ResourceType/id` in this identifier system:

```text
https://www.medplum.com/integrations/health-gorilla/source-reference
```

An entry's clinical date, when available, is carried as a `valueDateTime` extension on `List.entry`:

```text
https://www.medplum.com/integrations/health-gorilla/p360-clinical-date
```

Do not use `List.entry.date` for this value. FHIR R4 reserves that field for working Lists, while the
Patient360 inventory is an immutable snapshot.

Use the identifier value for display and submission. Do not resolve or submit the absolute Health
Gorilla URL in `List.entry.item.reference`. Required referenced resources are imported automatically,
even when they are not separately selected.

After the clinician confirms one or more identifiers, invoke the Task type operation with the exact
Task version they reviewed:

```http
POST [base]/fhir/R4/Task/$health-gorilla-hie-p360-ingest-selected
Authorization: Bearer [access-token]
Content-Type: application/fhir+json
```

```json
{
  "resourceType": "Parameters",
  "parameter": [
    { "name": "task", "valueReference": { "reference": "Task/example" } },
    { "name": "taskVersion", "valueString": "7" },
    { "name": "selected", "valueString": "Observation/source-id" },
    { "name": "selected", "valueString": "Condition/source-id" }
  ]
}
```

The reviewed version prevents stale inventory from being imported. If the Task or its manifest changes,
discard the previous selection, reload every current manifest List, and ask the user to review again.
Do not automatically retry conflicts or network failures.

When either workflow reaches `completed`, refresh patient chart summaries so newly imported allergies,
problems, medications, and other clinical records are immediately visible.

### Discard a selective retrieval

A user may discard a Task that is `ready / awaiting-selection`. Cancel it with an optimistic update
using the current Task version. Preserve all Task inputs and outputs so the retrieved manifest remains
available for audit. A cancelled Task no longer blocks a future billable retrieval.

## Track retrieval status

Search for the patient's latest retrieval Task:

```http
GET [base]/fhir/R4/Task?patient=Patient/{id}&code=https://www.medplum.com/integrations/health-gorilla|p360-retrieve&_sort=-_lastUpdated&_count=1
```

The integration uses these status and phase combinations:

| Status        | Business phase        | Meaning                                                            | Application behavior                                      |
| ------------- | --------------------- | ------------------------------------------------------------------ | --------------------------------------------------------- |
| `in-progress` | `retrieving`          | Connected networks are preparing or returning the record           | Show progress and block another retrieval                 |
| `ready`       | `awaiting-selection`  | A selective inventory is ready; no clinical data has been imported | Stop polling, load the Lists, and wait for user selection |
| `in-progress` | `importing-selection` | The reviewed roots and required dependencies are being imported    | Show progress and block another retrieval                 |
| `on-hold`     | varies                | Manual intervention is required                                    | Alert operations and block another retrieval              |
| `completed`   | varies                | Import-all or selective ingestion completed                        | Show the imported count and refresh the chart             |
| `failed`      | varies                | Health Gorilla rejected the request or its result expired          | Show the failure and allow a fresh retrieval              |
| `cancelled`   | `awaiting-selection`  | A user discarded a selective inventory                             | Preserve audit data and allow a fresh retrieval           |

Treat `ready` as an open, billable-retrieval-blocking state. Poll only while a Task is actively
processing; stop interval polling at `ready` while keeping Task subscription updates enabled.

The Task also records ignored and unsupported inventory counts. After selective ingestion it records
the selected root count and total imported resource count; the imported total can be larger because
required dependencies are included.

:::warning[One retrieval at a time]
Do not start another retrieval while the latest Task is `in-progress`, `ready`, or `on-hold`. A second
call could start another metered network request. Subscription updates and the scheduled recovery
process should advance the existing Task instead.
:::

## Imported resources

:::info[What can land in the chart]
Patient360 can import the following resource types when they are present in the returned record:

- `AllergyIntolerance`, `Condition`, `ClinicalImpression`, `CarePlan`, and `Goal`
- `Medication`, `MedicationRequest`, and `MedicationStatement`
- `Observation`, `DiagnosticReport`, `ServiceRequest`, and `Specimen`
- `Encounter`, `Procedure`, and `Immunization`
- `DocumentReference` and `Coverage`
- `CareTeam`, `Practitioner`, `Organization`, and `Location`
  :::

The existing Medplum `Patient` remains authoritative. The Health Gorilla patient is not imported as a
second patient; references to it are rewritten to the existing local patient. `Composition` and
`Basic` wrapper resources are not imported, and resource types outside the supported list are ignored.

## Identity, provenance, and retries

Every imported resource is matched using its Health Gorilla source reference. Reprocessing the same
Patient360 result conditionally updates that resource instead of creating a duplicate. References
between imported resources are rewritten within FHIR transaction bundles so the imported graph remains
connected.

Imported resources carry this provenance tag:

```text
https://www.medplum.com/integrations/health-gorilla/p360-provenance|p360-sourced
```

The tag distinguishes outside records from data authored by your organization and prevents retrieved
data from being sent back to the exchange as new content.

## Attachment handling

:::caution[Attachment bodies are not imported]
Patient360 imports attachment metadata such as content type, language, title, declared size, hash, and
creation time when supplied. It removes both `Attachment.data` and `Attachment.url` before writing the
resource, and it does not create a `Binary` for Patient360 content.
:::

This means a `DocumentReference` can show that an outside document exists without making the document
body available in Medplum. Design the clinical workflow so users can distinguish metadata-only
documents from locally available attachments.

## Access control

Imported clinical resources that carry their own patient-compartment reference can be governed using
patient-scoped [AccessPolicies](/docs/access/access-policies). Access does not propagate through a
reference. For example, a standalone imported `Practitioner`, `Organization`, or `Location` is not in
the patient's compartment merely because an `Encounter` references it.

Before enabling retrieval for clinical users, test the actual AccessPolicy for each application role
against representative resources of every imported type your workflow displays. These access checks
do not require a Patient360 network request. Confirm access again after the first controlled production
retrieval.

## Troubleshooting

- **An operation rejects the patient:** add the missing matching demographics reported in the
  `OperationOutcome`, save the patient, and retry.
- **A Task remains `in-progress`:** allow the scheduled recovery process to retry it. Review the Task's
  `statusReason` and Bot execution audit events if it remains open.
- **A selective Task is `ready`:** review or discard the current inventory. Do not start another
  retrieval while it is waiting.
- **The inventory changes during review:** clear the selection, reload every manifest List referenced
  by the newest Task version, and ask the user to review it again.
- **A Task is `on-hold`:** contact Medplum support. Do not call either retrieval operation again while
  the Task is open.
- **The Task completed with no new records:** an empty network result is valid and does not indicate an
  ingestion failure.
- **A referenced resource is not visible to a user:** verify the user's AccessPolicy against that
  resource's own compartment references.

## Related reading

- [HIE overview](/docs/integration/health-information-exchange)
- [Getting Started](/docs/integration/health-information-exchange/getting-started)
- [Share clinical data](/docs/integration/health-information-exchange/sharing-clinical-data)
- [FHIR Task](/docs/api/fhir/resources/task)
- [Subscriptions](/docs/subscriptions)
