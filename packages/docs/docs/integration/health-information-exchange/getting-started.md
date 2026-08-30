---
sidebar_position: 2
description: Plan and launch the production-only Health Gorilla HIE integration with Medplum.
tags: [integration, hie]
---

# Getting Started with Health Gorilla HIE

:::caution[Plan for a production-only launch]
Health Gorilla has not yet provided a sandbox workflow for Patient360 retrieval or HIE share-back.
The integration is available only in production, so you cannot complete an end-to-end network test in
a sandbox today. Medplum will help your team separate the checks that can happen before enablement from
the first controlled validation in production.
:::

An HIE rollout brings clinical, operational, compliance, and technical decisions together. You do not
need to solve all of them at once—or wire the vendor connection on your own. This guide breaks the
implementation into a practical sequence your team can work through with Medplum.

:::tip[Medplum helps with setup]
Medplum coordinates Health Gorilla provisioning, production project configuration, callback setup,
recovery jobs, connectivity checks, and launch support. Your team brings the organizational details,
clinical workflow, FHIR data, access decisions, and final production approval.
:::

## 1. Confirm the fit and scope

Start by agreeing on the clinical experience you want to create. Identify:

- The organizations, practices, and production projects that will participate.
- Which clinicians and operational users may request or review outside records.
- Where a retrieval starts in your application and how users will see its progress.
- Expected query volume, because each Patient360 retrieval is a metered network request.
- When customer-authored encounter data is clinically ready for share-back.
- The technical and clinical owners who will complete pre-launch checks and oversee the controlled
  production rollout.

Patient360 queries are supported for treatment purposes. If your workflow needs a different purpose,
raise it during planning rather than adapting the treatment workflow.

## 2. Complete organizational onboarding

Health Gorilla and the applicable exchange networks vet each participating organization. The exact
requirements depend on the networks in scope, but you should be ready to provide:

- Legal organization and practice names, websites, addresses, and contact information.
- Organization and clinician NPIs.
- Evidence of the organization's healthcare role, covered-entity status, and insurance billing when
  required by the network.
- A description of the treatment workflow that will use outside records.
- A defined share-back workflow for new clinical data created by your organization.

[Contact the Medplum team](mailto:info+healthgorilla@medplum.com?subject=Health%20Information%20Exchange%20for%20Medplum)
to begin this process. Medplum will confirm availability and guide your organization through the
applicable vendor and network requirements.

## 3. Prepare your Medplum project

Medplum enables the managed integration components for your approved production environment. Together,
your team and Medplum will confirm that:

- Patient360 retrieval, completion callbacks, and scheduled recovery are enabled.
- The HIE share-back Bot is available in the customer project.
- The project supports the transaction and scheduled-job features used by the integration.
- The application roles that start retrievals or review imported records have the intended
  [AccessPolicies](/docs/access/access-policies).
- Your application has a clear place to show retrieval progress, completion, and manual-review states.
- Bot execution audit events and share-back archives are available to the operational team.

:::caution[Access does not follow references]
Patient-compartment access comes from a resource's own patient references. It does not automatically
extend to a standalone `Practitioner`, `Organization`, or `Location` referenced by an imported clinical
resource. Test the actual AccessPolicy for every role and resource type your application displays.
:::

You can use a non-production Medplum project to review application behavior, FHIR data quality, access
controls, and operational procedures. Without a Health Gorilla sandbox workflow, that project cannot
perform an end-to-end Patient360 retrieval or HIE share-back.

## 4. Prepare the FHIR data

### Patient matching data

Before a billable network request can start, the saved Medplum `Patient` needs enough demographics for
reliable matching:

- Given and family name.
- `birthDate` and a known `gender` value.
- An address with `postalCode`.
- Either a phone or email, or a full street address with `line`, `city`, `state`, and `postalCode`.

See [Patient matching requirements](/docs/integration/health-information-exchange/retrieving-patient-records#patient-matching-requirements)
for the full request behavior and an example patient.

### Share-back data

Choose an encounter that represents new care delivered by your organization. At minimum, prepare:

- A saved `Encounter` with `id`, `status`, `class`, and a direct `subject` reference to the patient.
- Encounter dates and a treating practitioner reference when known.
- A practitioner NPI when available.
- Clinical resources with required FHIR statuses, patient references, and standardized codes verified
  by your clinical or terminology team.
- Clinical documents with usable attachment content and an appropriate document type coding when
  available.

See [Prepare the encounter and chart](/docs/integration/health-information-exchange/sharing-clinical-data#prepare-the-encounter-and-chart)
for the detailed share-back contract.

## 5. Complete pre-launch checks without network exchange

Production-only availability does not mean skipping validation. Before Medplum enables the integration,
use representative FHIR data in a non-production Medplum project to:

1. Confirm that your application collects the required patient matching demographics.
2. Exercise the retrieval progress, completion, failure, and manual-review experience without making a
   Patient360 network request.
3. Test each production AccessPolicy against every supported resource type the application will
   display, including standalone referenced resources.
4. Review the proposed share-back trigger and patient-wide data scope with your clinical team.
5. Confirm that clinical resources have required statuses, patient references, and verified codes.
6. Review attachment handling, operational alerts, audit access, and support procedures.
7. Keep retrieval and automated share-back disabled until onboarding and the production validation plan
   are approved.

## 6. Coordinate the first production validation

Medplum will plan the initial live workflow with your technical and clinical owners. During that
controlled production validation:

:::caution[Every HIE request is a live production action]
Health Gorilla does not currently provide sandbox HIE connectivity. A Patient360 call queries
production networks and is metered; share-back sends data to production. Coordinate the first run with
Medplum, use a real patient in an authorized treatment workflow, and do not use a synthetic patient as
a connectivity test.
:::

1. Confirm that onboarding, network approval, production configuration, callbacks, and recovery jobs
   are complete.
2. Start one Patient360 retrieval for the selected patient and permitted treatment purpose.
3. Confirm that one `in-progress` `Task` is created and that the application prevents users from
   requesting another retrieval while it remains open.
4. Follow the callback or scheduled recovery process, then confirm the `Task` reaches `completed`.
5. Confirm that Medplum reused the existing patient, preserved references, and added the Patient360
   provenance tag without creating duplicates.
6. Review the imported chart, metadata-only attachments, and referenced resources using the production
   AccessPolicies.
7. Run the first approved share-back for customer-authored data and review its `OperationOutcome` and
   request archive before enabling automation.
8. Confirm that the outgoing archive contains the intended patient history and excludes
   Patient360-sourced resources.

:::info[An empty result can still be successful]
A completed Patient360 request may find no discoverable records. Treat that as a valid network result,
not an ingestion failure.
:::

## 7. Design the production experience

Before making the integration broadly available to clinical users, decide how your application and
operational team will handle:

- **Async progress:** show that a retrieval can take minutes or longer and refresh when its `Task`
  changes.
- **Open requests:** prevent users from repeatedly starting the same billable retrieval.
- **Clinical review:** distinguish outside records from locally authored data and route them through the
  appropriate reconciliation workflow.
- **Metadata-only documents:** make it clear when an outside `DocumentReference` does not include the
  document body.
- **Share-back timing:** trigger only after the encounter is clinically ready.
- **Manual review:** alert the operational team when a retrieval moves to `on-hold`.
- **Monitoring:** review Bot execution audit events, `Task.statusReason`, share-back outcomes, and
  request/response archives.

## Controlled production rollout checklist

- [ ] The team understands that end-to-end HIE testing is not currently available in sandbox.
- [ ] Organizational and network onboarding is approved.
- [ ] Patient360 and share-back are enabled in the intended production project.
- [ ] Patient matching data is collected before retrieval.
- [ ] Every user role has a tested AccessPolicy for the resources it displays.
- [ ] The application communicates asynchronous retrieval state clearly.
- [ ] Clinical review and reconciliation ownership is defined.
- [ ] The share-back trigger and data scope have clinical approval.
- [ ] Pre-launch checks are complete, and the controlled production validation plan is approved.
- [ ] The first live retrieval and share-back are coordinated with Medplum.
- [ ] Automated share-back remains disabled until the first production outcome and archive are reviewed.
- [ ] Operational owners know how to respond to `on-hold` and failed `Task` resources.

## What to read next

- [Retrieve Patient Records](/docs/integration/health-information-exchange/retrieving-patient-records)
- [Share Clinical Data](/docs/integration/health-information-exchange/sharing-clinical-data)
- [HIE overview](/docs/integration/health-information-exchange)
