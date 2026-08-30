---
sidebar_position: 3
description: Run a production-only Patient360 retrieval, follow its Task, and understand what arrives in Medplum.
tags: [integration, hie]
---

# Retrieve Patient Records from an HIE

:::caution[Production-only integration]
Patient360 retrieval is available only in production at this time. Health Gorilla has not yet provided
a sandbox workflow for end-to-end testing. Coordinate enablement and the first controlled production
retrieval with Medplum before exposing this operation to users.
:::

A new patient may arrive with years of history that your team cannot see yet. A Patient360 retrieval
asks participating exchange networks for that history and brings the supported results into the
patient's existing Medplum chart.

Because the network search runs asynchronously, your application starts it once, follows a FHIR
`Task`, and lets clinicians know when the chart is ready to review. Retrieval is available as the
`$health-gorilla-hie-p360` [custom operation](/docs/api/fhir/operations/custom-operations) on a saved
[`Patient`](/docs/api/fhir/resources/patient).

:::info[Before you begin]
Patient360 must be enabled for your production project by Medplum, and the patient must have complete
matching demographics. If you are still planning the rollout, start with
[Getting Started](/docs/integration/health-information-exchange/getting-started).
:::

## Patient matching requirements

Accurate demographics improve patient matching and prevent low-quality or empty network queries. The
operation validates the saved Medplum `Patient` before starting a billable retrieval.

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

:::warning[Each call is a live network request]
There is no Patient360 sandbox workflow. Call this operation only after production enablement, for an
authorized patient and the permitted treatment purpose. Each retrieval is a metered network request.
:::

## Start a retrieval

Call the instance-level operation on the saved patient:

```http
POST [base]/fhir/R4/Patient/{id}/$health-gorilla-hie-p360
Authorization: Bearer [access-token]
Content-Type: application/fhir+json
```

Using the Medplum SDK:

```ts
const outcome = await medplum.post(medplum.fhirUrl('Patient', patient.id, '$health-gorilla-hie-p360'));
```

The operation returns an [`OperationOutcome`](/docs/api/fhir/resources/operationoutcome) confirming
that the retrieval started. This response does not contain the outside records. Patient360 runs
asynchronously, and the associated `Task` records progress until ingestion completes.

:::tip[Design for asynchronous completion]
Treat the initial `OperationOutcome` as an acknowledgement, not the final result. Show progress from
the `Task`, subscribe to Task changes, or refresh the chart after the Task reaches a terminal state.
:::

:::warning[One retrieval at a time]
Each retrieval is a metered network request. If the patient already has a retrieval with status
`in-progress` or `on-hold`, the operation returns the existing request instead of starting another
billable retrieval.
:::

## Track retrieval status

Search for the patient's retrieval `Task` resources:

```http
GET [base]/fhir/R4/Task?patient=Patient/{id}&code=https://www.medplum.com/integrations/health-gorilla|p360-retrieve&_sort=-_lastUpdated
```

The integration uses these statuses:

| Status        | What it means                                                                                                | What your application should do                               |
| ------------- | ------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------- |
| `in-progress` | Patient360 accepted the request, is preparing the result, or Medplum will retry a transient processing error | Keep showing progress; do not start another retrieval         |
| `on-hold`     | Manual review is required                                                                                    | Alert the operational team and do not start another retrieval |
| `completed`   | Patient360 finished and all supported resources were written to Medplum                                      | Refresh the chart and begin clinical review                   |
| `failed`      | Patient360 rejected the request or its result expired                                                        | Show the failure and follow the operational escalation path   |

If the completion webhook is early or missed, a scheduled recovery process retries open requests.
Applications can poll the `Task`, subscribe to Task changes, or refresh the patient's chart after the
Task reaches a terminal status.

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

:::warning[Check standalone referenced resources]
A user may be able to read an imported `Encounter` but not the standalone `Practitioner`, `Organization`,
or `Location` it references. Test those resources directly instead of assuming the encounter grants
access.
:::

## Troubleshooting

- **The operation rejects the patient:** add the missing matching demographics reported in the
  `OperationOutcome`, save the patient, and retry.
- **A Task remains `in-progress`:** allow the scheduled recovery process to retry it. Review the Task's
  `statusReason` and Bot execution audit events if it remains open.
- **A Task is `on-hold`:** contact Medplum support. Do not call the operation again while the Task is
  open.
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
