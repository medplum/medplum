---
sidebar_position: 10
---

# Multiple Practice Locations


A single Medplum Project can serve many ScriptSure practice locations. This guide describes the data model and how prescribing resolves the correct practice per request.

## Data model

ScriptSure's administrative hierarchy is **Organization → Business Unit → Practice → User**. Medplum maps it as follows:

| ScriptSure entity | Medplum representation |
|---|---|
| Organization | The Medplum **Project** (id held in the `SCRIPTSURE_DEFAULT_ORG_ID` project secret) |
| Business Unit | An **`Organization`** with identifier `https://scriptsure.com/business-unit-id` and `type` coding `https://scriptsure.com/organization-type` = `business-unit` |
| Practice | An **`Organization`** with identifier `https://scriptsure.com/practice-id` (and optional facility NPI), `partOf` its Business Unit Organization, `type` = `practice` |
| Prescriber ↔ Practice | A **`PractitionerRole`** whose `organization` references the Practice Organization |

Example Practice Organization:

```json
{
  "resourceType": "Organization",
  "name": "Downtown Clinic",
  "type": [{ "coding": [{ "system": "https://scriptsure.com/organization-type", "code": "practice" }] }],
  "partOf": { "reference": "Organization/<business-unit-org-id>" },
  "identifier": [
    { "system": "https://scriptsure.com/practice-id", "value": "6159" },
    { "system": "http://hl7.org/fhir/sid/us-npi", "value": "1097724946" }
  ]
}
```

## How the practice is resolved per request

Each prescribing call resolves the target practice in this order:

1. **Explicit `organizationId`** — the Provider App passes the selected practice Organization id on the operation (e.g. `$order-medication`, `$order-set-url`, `$drug-search`) or bot input.
2. **Prescriber affiliation** — the prescriber's single ScriptSure practice Organization (via `PractitionerRole.organization` / `ProjectMembership.access`). If the prescriber is affiliated with more than one practice and no `organizationId` was passed, the request errors asking the caller to choose a location.
3. **Legacy secret** — the `SCRIPTSURE_PRACTICE_ID` / `SCRIPTSURE_BUSINESS_UNIT_ID` project secrets (backward compatibility for single-practice projects).

Drug and pharmacy directory searches can use the first prescriber affiliation when no explicit practice is selected. This catalog-search behavior does not select the practice for a later prescribing operation.

The Provider App shows a **location switcher** (top of the prescribe screen) when the prescriber has more than one ScriptSure practice; the selection is passed as `organizationId`.

## Provisioning the Organizations

You can create the practice/business-unit Organizations in two ways:

- **Entity webhook (recommended for ongoing sync).** In the ScriptSure console, open the Organization / Business Unit / Practice profile and click **SEND ENTITY WEBHOOK**. Point the entity webhook endpoint (at the Organization level) at the `scriptsure-entity-webhook-bot`. It idempotently upserts the two-level Organizations, prescriber `PractitionerRole` affiliations, and the ScriptSure user id on each prescriber's `ProjectMembership`.
- **Migration from existing secrets.** For a project already using a single `SCRIPTSURE_PRACTICE_ID`, run the migration to create the two-level Organizations from the secrets (additive; the secrets remain the fallback).

## Prescriber enrollment

Each prescriber must be associated with the practice(s) they prescribe from on the ScriptSure side, and have:

- a `ProjectMembership` identifier with `system` = the ScriptSure platform URL and `value` = their ScriptSure user id, and
- a `PractitionerRole` referencing each practice `Organization` (created automatically by the entity webhook bot, or manually).

## Sharing pharmacy Organizations

A pharmacy directory record can be shared across practices while each patient's preference remains private to their practice. For example, Maya at Practice A and Noah at Practice B can both reference the same Example Pharmacy Organization. Practice A can read Maya and the pharmacy; it cannot read Noah. Practice B can read Noah and the pharmacy; it cannot read Maya.

Keep public directory data on the pharmacy Organization and the preference on each Patient. Give trusted clinical callers access to pharmacy Organizations independently of the practice filter used for Patients and other clinical resources. Do not store patient-specific or practice-private information on shared pharmacy records.

This partial AccessPolicy illustrates the separation. It is not a complete prescribing policy: retain the necessary permissions for Bots, practice Organizations, PractitionerRoles, medications, and other resources.

```json
{
  "resourceType": "AccessPolicy",
  "name": "Practice patients and shared pharmacies",
  "resource": [
    {
      "resourceType": "Patient",
      "criteria": "Patient?_compartment=%org",
      "interaction": ["read", "search", "update"]
    },
    {
      "resourceType": "Organization",
      "criteria": "Organization?identifier=http://terminology.hl7.org/CodeSystem/NCPDPProviderIdentificationNumber|",
      "interaction": ["read", "search", "create", "update"]
    }
  ]
}
```

Bind `org` to the caller's practice Organization through `ProjectMembership.access.parameter`, as described in [custom access-policy variables](/docs/access/access-policies). The trailing `|` in the pharmacy criterion matches any identifier in that system. Normalize legacy alias-only pharmacy records to include the canonical NCPDP identifier before depending on this rule.

The pharmacy write permissions allow the add and sync bots, running as the caller, to persist and refresh directory data. No Organization delete permission is needed. Backend callers that only search the ScriptSure directory do not need directory persistence permissions. The removal bot needs read access to the referenced Organizations and read/update access to the Patient, rather than Organization create/update access.

Use resource-level tenant criteria for clinical resources rather than a blanket practice restriction that also hides the shared pharmacy directory. Review all effective policy grants and membership parameters when adapting this example. The example does not grant Patient creation or account reassignment; your patient-onboarding flow must continue assigning each patient to the correct tenant.

The server can stamp the creator's top-level access-policy compartment into a new resource's `meta.accounts`. This is not the add bot copying the patient's practice. Adjust that policy before creating shared pharmacy records. Use the authorized [$set-accounts operation](/docs/api/fhir/operations/set-accounts) when existing account assignments need correction; clearing accounts alone does not grant access, and `meta.compartment` is not directly writable.

All directory writers must be able to find the same existing pharmacy. Conditional creation cannot reuse a record hidden by the caller's access policy. Consolidate existing duplicates and their references deliberately before relying on unique matching; the bots do not automatically merge them.
