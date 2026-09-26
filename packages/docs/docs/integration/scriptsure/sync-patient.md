---
sidebar_position: 3
---

# Sync a Patient


**Bot:** `scriptsure-patient-sync-bot`

Syncs a Medplum `Patient` to ScriptSure before an encounter. This bot is the API entry point for patient data sync–if you're embedding the prescribing UI in a React app, see [Prescribing iFrame](/docs/integration/scriptsure/iframe) instead, as the hook there handles patient sync automatically.

Run this bot before an encounter and after changing patient data. It reuses saved ScriptSure identifiers and checks existing allergies before creating new ones. Only one sync for the same Medplum patient can run at a time. The sync attempts these stages in order:

1. Creates the patient in ScriptSure (or updates if already synced)
2. Checks existing allergies and uploads new `AllergyIntolerance` resources for drug-allergy interaction checks
3. Pushes active `MedicationRequest` resources (for drug-drug interaction checks)
4. Catches up on missed prescription webhook events
5. Downloads medication history from SureScripts (if the patient has active consent)
6. Syncs preferred pharmacies as Medplum `Organization` resources
7. Reconciles pending prescription messages

An allergy sync error stops the remaining stages and rejects the bot call. Earlier writes may already have completed; the operation is not an atomic transaction.

Patient sync does **not** upload `Condition` resources to ScriptSure's patient diagnosis list. Diagnoses attached through the separate [medication-order workflow](/docs/integration/scriptsure/order-medication) do not make patient sync a diagnosis synchronization service.

## Patient resource requirements

The following fields are read during sync. Name, DOB, and address are needed for accurate prescribing.

| Field | FHIR source |
|---|---|
| First / last name | `Patient.name[0].given[0]`, `Patient.name[0].family` |
| Date of birth | `Patient.birthDate` |
| Gender | `Patient.gender` (`male` → `M`, `female` → `F`, otherwise `U`) |
| Address | `Patient.address[0]` (line, city, state, postalCode) |
| Phone | `Patient.telecom` where `system = 'phone'` (`use` maps to home/work/cell) |
| Email | `Patient.telecom` where `system = 'email'` (optional) |

Phone numbers are normalized to 10 digits (leading `+1` stripped, non-digits removed).

## Example bot execution

```typescript
const result = await medplum.executeBot(
  { system: 'https://www.medplum.com/bots', value: 'scriptsure-patient-sync-bot' },
  { patientId: 'REPLACE_WITH_MEDPLUM_PATIENT_ID' }
);
// { scriptSurePatientId: 11111 }
// or { skipped: true, providerNotReady: true } if the prescriber hasn't completed enrollment
```

## AllergyIntolerance sync

The bot reads the patient's `AllergyIntolerance` resources and fetches the existing ScriptSure allergy list once. It uses that snapshot to check stored identifiers and avoid duplicate creates; it does not fetch each remote allergy separately.

Use verified RxNorm or NDC coding for direct upload. If neither coding is present, the bot searches ScriptSure by allergy name and requires one unambiguous, exact match, ignoring case and surrounding whitespace. Partial, missing, or ambiguous matches fail sync instead of silently omitting the allergy. A failed search is reported as a failure, not as an empty search result.

The following resource is a template. Replace the patient ID, RxNorm code, and matching allergen name with verified values before using it:

```json
{
  "resourceType": "AllergyIntolerance",
  "patient": { "reference": "Patient/REPLACE_WITH_MEDPLUM_PATIENT_ID" },
  "code": {
    "coding": [{ "system": "http://www.nlm.nih.gov/research/umls/rxnorm", "code": "REPLACE_WITH_VERIFIED_RXNORM_CODE" }],
    "text": "REPLACE_WITH_MATCHING_ALLERGEN_NAME"
  }
}
```

After a successful create or a verified existing match, the bot stores the ScriptSure allergy ID on `AllergyIntolerance.identifier`. The value below is an example identifier:
```json
{
  "identifier": [{ "system": "https://scriptsure.com/allergy-id", "value": "12345" }]
}
```

An existing identifier is not sufficient to skip verification. A missing remote ID, multiple matches, a status mismatch, or an unverifiable allergen code/name requires reconciliation. The bot does not automatically replace missing remote records or update an existing remote allergy. Review the records in both systems rather than removing the identifier to force another create.

### Handling incomplete sync

Handle a rejected bot execution before opening the iframe. The [React iframe hook](/docs/integration/scriptsure/iframe) calls `onError` when patient sync rejects and does not request a new iframe URL for that run. Applications that call the bots directly must also stop on the sync error.

- **No unique codeset match:** verify the allergen coding or name. Repeating the unchanged request will not resolve the match.
- **Remote record mismatch:** reconcile the referenced allergy in Medplum and ScriptSure before trying again.
- **API or local persistence failure:** investigate access and service availability. A vendor write may have succeeded even if saving its identifier in Medplum failed; the next sync checks the remote list first.
- **Missing encounter ID:** resolve the ScriptSure encounter problem before retrying.
- **Local search reaches 1,000 allergies:** the bot fails before uploading allergies because it cannot establish a complete local set from that page. This case requires investigation rather than an automatic retry loop.
- **Another sync is running:** wait for it to finish. A lease left by an interrupted run expires after 60 seconds.

Successful responses can still contain pharmacy warnings, and provider onboarding can return `skipped: true` with `providerNotReady: true`. These are separate from allergy failures. The generic iframe hook does not expose successful response warnings; applications needing them should inspect the result of a direct bot call.

### Request budgets and throttling

Each sync allows at most 100 vendor requests and uses a 25-second vendor request deadline measured from the start of the handler. These guards include login and clinical requests made through that sync's client. They are local execution safeguards, **not ScriptSure's published rate limits**. The subsequent iframe bot invocation has a separate client.

When ScriptSure returns HTTP 429, the sync stops issuing further vendor requests. If ScriptSure supplies `Retry-After`, the error includes the minimum wait before retrying. The bot does not sleep through the wait, automatically retry writes, or schedule another run. Keep the prescribing UI closed while sync remains incomplete; correct permanent errors before retrying and avoid immediate retry loops.

The patient-wide snapshot, reuse of the encounter within allergy sync, and lookup caching avoid per-allergy verification requests. Unchanged, verified allergies do not cause local identifier writes. Serializing the same patient's sync requires two extra Patient reads and two version-checked updates on the normal path, which consume [Medplum FHIR quota](/docs/rate-limits).

These guards do not coordinate requests across different patients or enforce a vendor-wide quota. Before increasing sync throughput, confirm the applicable ScriptSure limits and their scope with your integration support team, and account for other bots and iframe traffic sharing the quota. Medplum's own request and weighted FHIR quotas also apply.

## MedicationRequest sync (DDI)

Active `MedicationRequest` resources with `intent: 'order'` or `intent: 'plan'` and `status: 'active'` are pushed as current medications for drug-drug interaction (DDI) checking. RxNorm or NDC codes are required for ScriptSure to resolve the drug.

```json
{
  "resourceType": "MedicationRequest",
  "status": "active",
  "intent": "plan",
  "subject": { "reference": "Patient/patient-xyz" },
  "medicationCodeableConcept": {
    "coding": [{ "system": "http://www.nlm.nih.gov/research/umls/rxnorm", "code": "617320" }],
    "text": "Lisinopril 10 mg"
  }
}
```

## Drug history consent

To enable SureScripts medication history download, create an active `Consent` resource linked to the patient:

```json
{
  "resourceType": "Consent",
  "status": "active",
  "scope": {
    "coding": [{ "system": "http://terminology.hl7.org/CodeSystem/consentscope", "code": "patient-privacy" }]
  },
  "category": [
    {
      "coding": [{ "system": "http://loinc.org", "code": "59284-0", "display": "Privacy Consent Document" }]
    }
  ],
  "patient": { "reference": "Patient/patient-xyz" },
  "dateTime": "2026-01-01T00:00:00.000Z"
}
```

To revoke, set `status` to `"inactive"`. The next sync will disable drug history download for that patient.
