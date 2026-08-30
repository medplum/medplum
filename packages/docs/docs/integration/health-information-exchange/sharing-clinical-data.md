---
sidebar_position: 3
tags: [integration, hie]
---

# Share Clinical Data with an HIE

HIE share-back sends clinical data authored by your organization from Medplum to Health Gorilla as a
FHIR R4 transaction. Share-back supports data reciprocity: organizations that retrieve outside records
also contribute new treatment information to the longitudinal network record.

Medplum deploys the `write-back-hie` Bot as part of an approved HIE implementation. The Bot receives a
saved [`Encounter`](/docs/api/fhir/resources/encounter), resolves the patient and related chart data,
validates supported resources, and submits one transaction to Health Gorilla.

:::note[]
Complete sandbox validation with Medplum and Health Gorilla before enabling automated production
share-back. Network approval can depend on review of the clinical completeness and coding in a sample
submission.
:::

## What share-back sends

Each run starts from `Encounter.subject` and can include:

- The matching Health Gorilla `Patient`, created or resolved and then updated with the current Medplum
  demographics.
- The triggering `Encounter` and a resolved `Practitioner`.
- `ClinicalImpression`, `Condition`, `Procedure`, `MedicationRequest`, `AllergyIntolerance`,
  `Observation`, `Immunization`, and `DiagnosticReport` resources.
- `DocumentReference`, `Coverage`, and `Goal` resources.
- A `Provenance` resource that identifies the resources included in that submission.

The Bot finds the practitioner from `Encounter.participant` first, then falls back to
`Patient.generalPractitioner`. Clinical impressions are selected for the triggering encounter. Other
supported clinical resources are selected from the patient's chart, not only from the encounter.
Review this scope when designing the trigger so your organization intentionally shares the applicable
longitudinal history.

Patient360-sourced resources are excluded. Share-back also excludes its own request and response
archives, preventing outside data and operational records from being echoed back to the network.

When a `ClinicalImpression` contains narrative text, the integration also creates an idempotent
plain-text clinical-summary `DocumentReference` so the narrative is included in share-back.

## Prepare the encounter and chart

Before share-back, confirm:

- The `Encounter` is saved and has an `id`.
- `Encounter.subject` directly references the correct Medplum `Patient`.
- The encounter has `status` and `class`; include `period.start` and `period.end` when known.
- An encounter participant or `Patient.generalPractitioner` references the treating practitioner.
- The practitioner has an NPI identifier when available.
- Clinical resources carry required FHIR statuses, patient references, and appropriate standardized
  codes. Use codes selected and verified by your clinical or terminology team.
- Clinical documents have `status`, at least one usable `content` entry, and an appropriate document
  type coding when available.

Resources in `entered-in-error`, `cancelled`, or `nullified` states are not shared. Conditions with a
verification status of `refuted` or `entered-in-error` are also excluded.

## Run share-back

You can invoke the deployed Bot directly or trigger it from a reviewed workflow. For example, use a
tightly scoped [Subscription](/docs/subscriptions) when an encounter reaches the agreed completion
state.

The exact Bot ID is project-specific. It can also be resolved by this identifier:

```text
https://www.medplum.com/integrations/bot-identifier|health-gorilla-labs/write-back-hie
```

Example direct execution:

```http
POST [base]/fhir/R4/Bot/$execute?identifier=https://www.medplum.com/integrations/bot-identifier|health-gorilla-labs/write-back-hie
Authorization: Bearer [access-token]
Content-Type: application/fhir+json

{
  "resourceType": "Encounter",
  "id": "example-encounter",
  "status": "finished",
  "class": {
    "system": "http://terminology.hl7.org/CodeSystem/v3-ActCode",
    "code": "<verified-encounter-class-code>"
  },
  "subject": { "reference": "Patient/example-patient" },
  "period": { "start": "2026-08-29T16:00:00Z", "end": "2026-08-29T16:30:00Z" }
}
```

Replace the placeholder with an encounter class code verified by your clinical or terminology team.
Use values from your saved encounter in production; the example is illustrative and not a clinical
coding recommendation.

## Validation and exclusions

Share-back validates each resource before building the transaction. A resource missing a FHIR element
required by the integration is excluded and reported as a warning so that one unusable resource does
not invalidate the entire transaction. The integration also removes references that cannot be mapped
safely to the outgoing bundle or an existing Health Gorilla resource.

Additional limits protect the transaction:

- Patient-level history searches consider at most the 1,000 most recently updated resources of each
  supported type in one run. Clinical impressions are selected separately for the triggering encounter.
- A Medplum `Binary` referenced by a `DocumentReference` is inlined for Health Gorilla only when it can
  be downloaded and is no larger than 5 MB.
- A document with no usable attachment content is excluded.

The returned [`OperationOutcome`](/docs/api/fhir/resources/operationoutcome) summarizes the number of
entries sent, references rewritten, and resources excluded. Any failed entry in Health Gorilla's
transaction response is returned as an error.

## Idempotency and audit records

Share-back conditionally updates Health Gorilla resources using a source identifier derived from the
Medplum resource reference. Re-running the same encounter updates the corresponding resources instead
of accumulating duplicate copies. `Provenance` is created for each submission because each share-back
is a distinct event.

For troubleshooting and auditability, the integration stores both the outgoing request bundle and the
Health Gorilla response as tagged `DocumentReference` attachments in Medplum. These records are linked
to the patient and excluded from future share-back.

## Production checklist

- Restrict Bot execution and any triggering Subscription to authorized project members.
- Trigger share-back only after the encounter data is clinically ready.
- Test the full resource and attachment scope with an approved sandbox patient.
- Review warnings in the `OperationOutcome`; a successful transaction can still exclude individual
  resources that were not ready to send.
- Confirm that Patient360-tagged data is absent from the outgoing request archive.
- Monitor Bot execution audit events and the request/response archives after go-live.
- Revalidate the workflow after material changes to your chart model, coding, or document storage.

## Related reading

- [HIE overview](/docs/integration/health-information-exchange)
- [Retrieve patient records](/docs/integration/health-information-exchange/retrieving-patient-records)
- [FHIR transaction bundles](/docs/fhir-datastore/fhir-batch-requests)
- [Binary data and attachments](/docs/fhir-datastore/binary-data)
