---
sidebar_position: 10
---

# Multiple Practice Locations

:::caution[Beta]
The ScriptSure integration is in beta. Features and APIs may change.
:::

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

The Provider App shows a **location switcher** (top of the prescribe screen) when the prescriber has more than one ScriptSure practice; the selection is passed as `organizationId`.

## Provisioning the Organizations

You can create the practice/business-unit Organizations in two ways:

- **Entity webhook (recommended for ongoing sync).** In the ScriptSure console, open the Organization / Business Unit / Practice profile and click **SEND ENTITY WEBHOOK**. Point the entity webhook endpoint (at the Organization level) at the `scriptsure-entity-webhook-bot`. It idempotently upserts the two-level Organizations, prescriber `PractitionerRole` affiliations, and the ScriptSure user id on each prescriber's `ProjectMembership`.
- **Migration from existing secrets.** For a project already using a single `SCRIPTSURE_PRACTICE_ID`, run the migration to create the two-level Organizations from the secrets (additive; the secrets remain the fallback).

## Prescriber enrollment

Each prescriber must be associated with the practice(s) they prescribe from on the ScriptSure side, and have:

- a `ProjectMembership` identifier with `system` = the ScriptSure platform URL and `value` = their ScriptSure user id, and
- a `PractitionerRole` referencing each practice `Organization` (created automatically by the entity webhook bot, or manually).
