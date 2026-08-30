---
sidebar_position: 4
description: Use the production-only HIE integration to share customer-authored clinical data through Health Gorilla.
tags: [integration, hie]
---

# Share Clinical Data with an HIE

:::caution[Production-only integration]
HIE share-back is available only in production at this time. Health Gorilla has not yet provided a
sandbox workflow for end-to-end testing. Review the intended data scope before launch, then coordinate
the first controlled production submission with Medplum before enabling automation.
:::

An HIE becomes more useful when every participant contributes the care it provides. After an encounter
is clinically complete, Medplum can share your organization's supported chart data with Health Gorilla
so the next treating clinician has a more complete longitudinal record.

Patient360-sourced data is automatically left out, preventing exchange records from being echoed back
as your own. The `write-back-hie` Bot receives a saved
[`Encounter`](/docs/api/fhir/resources/encounter), resolves the patient and related chart data,
validates supported resources, and submits a FHIR R4 transaction to Health Gorilla.

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
`Patient.generalPractitioner`.

:::warning[Review the patient-wide scope]
Clinical impressions are selected for the triggering encounter, but other supported clinical resources
come from the patient's longitudinal chart—not only from that encounter. During bundle construction,
supported clinical resources are linked to the triggering encounter. Review the resulting scope with
your clinical team before automating share-back.
:::

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

:::warning[Executing the Bot sends data to production]
There is no sandbox or dry-run workflow. Review the patient-wide data scope before invoking the Bot,
and manually coordinate the first live submission with Medplum. Enable an automated trigger only after
the production outcome and archived request have been reviewed.
:::

The exact Bot ID is project-specific. The Medplum SDK can resolve it by identifier:

```ts
const encounter = await medplum.readResource('Encounter', encounterId);
const outcome = await medplum.executeBot(
  {
    system: 'https://www.medplum.com/integrations/bot-identifier',
    value: 'health-gorilla-labs/write-back-hie',
  },
  encounter
);
```

<details>
<summary>FHIR REST example</summary>

The Bot identifier is:

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

</details>

:::tip[Repeat runs update identified resources]
Share-back conditionally updates resources using their Medplum source references, so a repeat run does
not accumulate duplicate copies of those resources. Each run still creates a new `Provenance` because
each submission is a distinct event.
:::

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

:::info[What the outcome tells you]
The returned [`OperationOutcome`](/docs/api/fhir/resources/operationoutcome) summarizes the number of
entries sent, references rewritten, and resources excluded. A successful transaction can still contain
warnings for individual resources that were not ready to send. Any failed entry in Health Gorilla's
transaction response is returned as an error.
:::

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
- Review the full resource and attachment scope with representative Medplum data before the first live
  submission.
- Coordinate the first production submission with Medplum, and keep automated triggers disabled until
  the controlled validation is complete.
- Review warnings in the `OperationOutcome`; a successful transaction can still exclude individual
  resources that were not ready to send.
- Confirm that Patient360-tagged data is absent from the outgoing request archive.
- Monitor Bot execution audit events and the request/response archives after go-live.
- Coordinate another controlled production verification after material changes to your chart model,
  coding, or document storage.

## Related reading

- [HIE overview](/docs/integration/health-information-exchange)
- [Getting Started](/docs/integration/health-information-exchange/getting-started)
- [Retrieve patient records](/docs/integration/health-information-exchange/retrieving-patient-records)
- [FHIR transaction bundles](/docs/fhir-datastore/fhir-batch-requests)
- [Binary data and attachments](/docs/fhir-datastore/binary-data)
