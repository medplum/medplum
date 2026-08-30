---
sidebar_position: 2
description: Plan, configure, and validate a Health Gorilla HIE workflow before going live.
tags: [integration, hie]
---

# Getting Started with Health Gorilla HIE

An HIE rollout brings clinical, operational, compliance, and technical decisions together. You do not
need to solve all of them at once—or wire the vendor connection on your own. This guide breaks the
implementation into a practical sequence your team can work through with Medplum.

:::tip[Medplum helps with setup]
Medplum coordinates Health Gorilla provisioning, project configuration, callback setup, recovery jobs,
and connectivity testing. Your team brings the organizational details, clinical workflow, FHIR data,
access decisions, and final production approval.
:::

## 1. Confirm the fit and scope

Start by agreeing on the clinical experience you want to create. Identify:

- The organizations, practices, and environments that will participate.
- Which clinicians and operational users may request or review outside records.
- Where a retrieval starts in your application and how users will see its progress.
- Expected query volume, because each Patient360 retrieval is a metered network request.
- When customer-authored encounter data is clinically ready for share-back.
- The technical and clinical owners who will validate the workflow in sandbox and production.

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

Medplum enables the managed integration components for your approved environment. Together, your team
and Medplum will confirm that:

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

## 5. Validate the complete workflow in sandbox

Use an approved, consented test patient with complete matching demographics. A good end-to-end test
does more than confirm a successful HTTP response—it confirms that clinicians can safely use the data.

:::caution[Keep production data out of sandbox]
Use synthetic or explicitly approved test data. Do not submit production patient data to a sandbox
environment.
:::

1. Start one Patient360 retrieval with `POST Patient/{id}/$health-gorilla-hie-p360`.
2. Confirm that one `in-progress` `Task` is created and that a second request does not start while the
   first remains open.
3. Allow the callback or scheduled recovery process to finish the request, then confirm the `Task`
   reaches `completed`.
4. Confirm that Medplum reused the existing patient, imported supported resources without duplicates,
   preserved references, and added the Patient360 provenance tag.
5. Confirm that imported attachment metadata is visible, attachment bodies are absent, and no
   Patient360 `Binary` was created.
6. Review the imported chart using each production AccessPolicy that will display HIE data.
7. Run share-back for a customer-authored encounter and review the returned `OperationOutcome`.
8. Confirm that the outgoing archive excludes Patient360-sourced resources and includes only the
   intended customer-authored chart history.
9. Re-run callback or recovery processing, then repeat share-back, to confirm that idempotent resources
   do not duplicate without starting another metered retrieval.

:::info[An empty result can still be successful]
A completed Patient360 request may find no discoverable records. Treat that as a valid network result,
not an ingestion failure.
:::

## 6. Design the production experience

Before go-live, decide how your application and operational team will handle:

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

## Ready-for-production checklist

- [ ] Organizational and network onboarding is approved.
- [ ] Patient360 and share-back are enabled in the intended production project.
- [ ] Patient matching data is collected before retrieval.
- [ ] Every user role has a tested AccessPolicy for the resources it displays.
- [ ] The application communicates asynchronous retrieval state clearly.
- [ ] Clinical review and reconciliation ownership is defined.
- [ ] The share-back trigger and data scope have clinical approval.
- [ ] The sandbox test passed for retrieval, retry, access, attachments, share-back, and audit records.
- [ ] Operational owners know how to respond to `on-hold` and failed `Task` resources.

## What to read next

- [Retrieve Patient Records](/docs/integration/health-information-exchange/retrieving-patient-records)
- [Share Clinical Data](/docs/integration/health-information-exchange/sharing-clinical-data)
- [HIE overview](/docs/integration/health-information-exchange)
