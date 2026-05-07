---
sidebar_position: 3
sidebar_label: Access Policy for Practitioners
---

# Access Policy for Practitioners

This guide lists the [`AccessPolicy`](/docs/api/fhir/medplum/accesspolicy) rules a non-admin
practitioner needs to send Health Gorilla lab orders and read results back. Each rule is paired
with the operation it unblocks so you can add only what you need.

:::info[Why this matters]
Project admins (`ProjectMembership.admin = true`) bypass per-resource access policy checks. If your
team has been operating with admin enabled, the access policy doesn't actually constrain anything —
the moment you switch a practitioner to non-admin, every missing rule below surfaces as a `403
Forbidden` from a different operation in the lab order pipeline.
:::

## How Health Gorilla bots run

The two bots referenced throughout the integration —
`health-gorilla-labs/send-to-health-gorilla` and `health-gorilla-labs/autocomplete` — are
configured with `runAsUser: true`. That flag means the bot executes against Medplum using the
**calling practitioner's** access policy, not a privileged service account. Every read, write, and
sub-bot invocation the bot performs goes through your practitioner's policy.

This is intentional: data the bot creates (`ServiceRequest`, `Specimen`, `DocumentReference`,
`Binary` attachments, etc.) is automatically scoped to the practitioner's organization via the
account-inheritance rules described in [Compartments](/docs/access/access-policies#compartments).
The flip side: every resource the bot touches must be permitted by the practitioner's access
policy.

The HG bots themselves typically live in a Medplum project that is **linked** to your project
rather than in your project directly. Read access still flows through your policy — you'll need a
`Bot` rule scoped to the two HG identifiers, which Medplum resolves across linked projects.

## The minimum policy

The policy below covers the full lab order lifecycle for a practitioner who belongs to a single
organization. It assumes a `provider_organization` parameter is set on the
[`ProjectMembership.access[]`](/docs/api/fhir/medplum/projectmembership) entry — see
[Parameterized Policies](/docs/access/access-policies#parameterized-policies).

```json
{
  "resourceType": "AccessPolicy",
  "name": "Practitioner — Health Gorilla",
  "compartment": { "reference": "%provider_organization" },
  "resource": [
    { "resourceType": "Patient", "criteria": "Patient?_compartment=%provider_organization" },
    { "resourceType": "ServiceRequest", "criteria": "ServiceRequest?_compartment=%provider_organization" },
    { "resourceType": "DiagnosticReport", "criteria": "DiagnosticReport?_compartment=%provider_organization" },
    { "resourceType": "DocumentReference", "criteria": "DocumentReference?_compartment=%provider_organization" },
    { "resourceType": "Specimen", "criteria": "Specimen?_compartment=%provider_organization" },
    { "resourceType": "QuestionnaireResponse", "criteria": "QuestionnaireResponse?_compartment=%provider_organization" },
    { "resourceType": "RequestGroup", "criteria": "RequestGroup?_compartment=%provider_organization" },
    { "resourceType": "Coverage", "criteria": "Coverage?_compartment=%provider_organization" },
    { "resourceType": "Binary" },
    {
      "resourceType": "Bot",
      "readonly": true,
      "criteria": "Bot?identifier=https://www.medplum.com/integrations/bot-identifier|health-gorilla-labs/send-to-health-gorilla,https://www.medplum.com/integrations/bot-identifier|health-gorilla-labs/autocomplete"
    },
    {
      "resourceType": "Organization",
      "readonly": true,
      "criteria": "Organization?_id=%provider_organization.id"
    },
    {
      "resourceType": "Organization",
      "readonly": true,
      "criteria": "Organization?partof=Organization/%provider_organization.id"
    },
    { "resourceType": "CodeSystem", "readonly": true },
    { "resourceType": "ValueSet", "readonly": true },
    { "resourceType": "Practitioner", "readonly": true },
    { "resourceType": "Questionnaire", "readonly": true }
  ]
}
```

## What each rule unblocks

### Resources written by the order bundle

[`createLabOrderBundle`](https://www.npmjs.com/package/@medplum/health-gorilla-core) (and the
`useHealthGorillaLabOrder` hook) produces a `transaction` Bundle containing:

| Resource | Why it's needed |
| --- | --- |
| `ServiceRequest` | The parent order (with `meta.profile = MedplumHealthGorillaOrder`) plus one child SR per test. |
| `QuestionnaireResponse` | One per test that has Ask-On-Order-Entry questions answered. |
| `Specimen` | Optional — only when `specimenCollectedDateTime` is supplied. |
| `Coverage` | Optional — only when `billTo === 'insurance'`. |
| `DiagnosticReport` | Created by the bot when results come back. |
| `DocumentReference` | Wraps the requisition PDF and other HG-side documents. |

All of these get the practitioner's organization stamped onto `meta.account` automatically — so
`_compartment=%provider_organization` is the right scoping.

### `Binary` — special-cased

The `send-to-health-gorilla` bot calls `medplum.createAttachment(...)` after a successful
transmission, which creates one or more `Binary` resources for the requisition document and
specimen labels. Without a `Binary` rule, the bot fails with:

```
OperationOutcomeError: Forbidden
  at Ht.createAttachment ...
  at downloadHealthGorillaDocument ...
```

`Binary` resources have no FHIR search parameters, so any `criteria` you put on the rule is
ignored — see [Binaries](/docs/access/access-policies#binaries). An unconstrained
`{ "resourceType": "Binary" }` rule grants project-wide access; for tighter control, use
[`securityContext`](/docs/access/binary-security-context).

### `Bot` — scoped to the two HG identifiers

`Bot/$execute` requires read access on the bot resource itself. The two HG bots both live under
the well-known `https://www.medplum.com/integrations/bot-identifier` system. Listing both values
in a single comma-separated `identifier=` filter scopes the rule precisely:

```json
{
  "resourceType": "Bot",
  "readonly": true,
  "criteria": "Bot?identifier=https://www.medplum.com/integrations/bot-identifier|health-gorilla-labs/send-to-health-gorilla,https://www.medplum.com/integrations/bot-identifier|health-gorilla-labs/autocomplete"
}
```

This permits invoking the HG bots without granting the practitioner access to any other Bot in the
project. Add new identifiers to the comma-separated list as more HG bots are introduced.

### `Organization` — three rules to cover three cases

A practitioner needs to read three kinds of `Organization` resources:

1. **Their own practice.** Organizations don't appear in their own
   `meta.compartment`, so a plain `_compartment` filter won't match the practitioner's own
   organization. Match by id instead:

   ```json
   { "resourceType": "Organization", "readonly": true, "criteria": "Organization?_id=%provider_organization.id" }
   ```

2. **Sub-orgs of their practice** — typically the per-practice lab contracts whose
   `partOf` points at the practice. The criteria string must spell out the resource type
   explicitly; substituting `%provider_organization` directly does **not** bind for reference
   matching.

   ```json
   { "resourceType": "Organization", "readonly": true, "criteria": "Organization?partof=Organization/%provider_organization.id" }
   ```

3. **Imported organizations in the patient's compartment** — for example, a primary care
   provider attached to an imported patient bundle. These get `meta.account =
   Organization/<practice>` via the patient's account propagation, so a standard `_compartment`
   filter applies:

   ```json
   { "resourceType": "Organization", "readonly": true, "criteria": "Organization?_compartment=%provider_organization" }
   ```

   Note this rule only fires once your import path actually propagates the practice into
   `meta.accounts` on each imported resource (call `Patient/<id>/$set-accounts` with
   `propagate: true`).

### `CodeSystem` and `ValueSet` — terminology lookups

`ValueSet/$expand` (used by ICD-10 diagnosis pickers, LOINC test pickers, etc.) needs read access
on the `ValueSet` itself and on the `CodeSystem`s it composes from. Both are project-wide,
non-PHI resources, so unscoped `readonly: true` rules are appropriate.

## The Health Gorilla "tenant" Organization

The send-order bot rejects orders whose `performingLabAccountNumber` extension doesn't match an
account number HG has on file for the requesting practice. The practice (sometimes called the
"tenant" by HG) is identified by an `Organization` resource that conforms to the
`MedplumHealthGorillaTenant` profile:

```
https://medplum.com/profiles/integrations/health-gorilla/StructureDefinition/MedplumHealthGorillaTenant
```

The profile requires:

- `name` (1..1)
- `telecom` with at least one `system: phone` entry
- `address` with `line`, `city`, `state`, `postalCode`

If the practice Organization is missing any of these, HG rejects with:

```
Provided account number 87659430 is not on the list of account numbers assigned to this practice
```

even when the account number is correct. Conform the practice Organization to the profile, then
re-submit.

## Operational checklist

Before flipping a practitioner from `admin: true` to `admin: false`:

1. Attach the policy above (or a project-specific equivalent) via `ProjectMembership.access[]`,
   parameterized to the practitioner's organization.
2. Verify the practitioner can still read the two HG bots (try `searchTestCatalog` from the
   front-end or `Bot/$execute?identifier=...` directly).
3. Verify `ValueSet/$expand` succeeds for the diagnosis picker.
4. Submit a test lab order end-to-end against the HG sandbox and confirm the requisition `Binary`
   gets attached without a `Forbidden`.

Skip step 1 and the bot's `403`s will be your first feedback signal, but the others won't surface
until a clinician actually tries to place an order.
