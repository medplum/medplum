---
sidebar_position: 3
---

# Sync a Patient


**Bot:** `scriptsure-patient-sync-bot`

Syncs a Medplum `Patient` to ScriptSure before an encounter. This bot is the API entry point for patient data sync–if you're embedding the prescribing UI in a React app, see [Prescribing iFrame](/docs/integration/scriptsure/iframe) instead, as the hook there handles patient sync automatically.

This bot is idempotent and safe to call on every encounter. What it does on each call:

1. Creates the patient in ScriptSure (or updates if already synced)
2. Pushes unsynced `AllergyIntolerance` resources (for drug-allergy interaction checks)
3. Pushes active `MedicationRequest` resources (for drug-drug interaction checks)
4. Catches up on missed prescription webhook events
5. Downloads medication history from SureScripts (if the patient has active consent)
6. Pushes missing local preferred pharmacies to ScriptSure, then reconciles the vendor list as Medplum `Organization` resources and Patient preferences

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
  { patientId: 'patient-xyz' }
);
// { scriptSurePatientId: 11111 }
// or { skipped: true, providerNotReady: true } if the prescriber hasn't completed enrollment
```

## Preferred pharmacy sync

Confirm that the deployed patient-sync bot in your target project includes outbound pharmacy sync. Older deployments may only pull from ScriptSure. Updating the server alone does not update project-specific bot code.

For readable local pharmacy references with an NCPDP identifier, sync works in this order:

1. Fetch the patient's preferred pharmacies from ScriptSure.
2. Add local preferred pharmacies that are missing from that list. If a newly added pharmacy is marked primary locally, set it as the ScriptSure default.
3. Fetch the vendor list again if anything was added, then reconcile the pharmacy Organizations and the Patient's preferred-pharmacy extensions.

Changing primary status locally for a pharmacy already listed in ScriptSure does not push that primary-status change. Use `addToFavorites` with `setAsPrimary: true` to update the vendor default. Use the [removal/replacement bot](/docs/integration/scriptsure/pharmacy-search#remove-or-replace-a-preferred-pharmacy) to remove an association from both systems, and finish that operation before running patient sync.

For the pharmacy portion, the execution identity needs Organization `search`, `read`, `create`, and `update`, plus Patient `read` and `update`. An existing pharmacy may be refreshed with vendor directory data, so read-only Organization access is insufficient. Other parts of patient sync need their own resource permissions. See [Sharing pharmacy Organizations](/docs/integration/scriptsure/multiple-locations#sharing-pharmacy-organizations).

### Check pharmacy sync results

Pharmacy reconciliation failures can return a normal bot response containing a `warnings` entry with `code: 'pharmacy-sync-failed'` and an explanatory `message`. Inspect these warnings even when a ScriptSure patient ID is returned. After an Organization persistence failure, the bot skips applying the pharmacy snapshot to the Patient; earlier Organization writes may already have completed.

Unreadable local pharmacy references are logged and skipped during the outbound pass, so an absent warning alone is not proof that every local preference was pushed. Confirm the expected pharmacies in ScriptSure when validating a deployment. A successful HTTP response or INFO log by itself does not establish complete pharmacy sync.

## AllergyIntolerance sync

All `AllergyIntolerance` resources linked to the patient are pushed on first sync. Use RxNorm or NDC codes for accurate drug-allergy interaction (DAI) checking. The bot falls back to a freetext name match when no coded identifier is present.

```json
{
  "resourceType": "AllergyIntolerance",
  "patient": { "reference": "Patient/patient-xyz" },
  "code": {
    "coding": [{ "system": "http://www.nlm.nih.gov/research/umls/rxnorm", "code": "723" }],
    "text": "Amoxicillin"
  }
}
```

Once synced, the ScriptSure allergy ID is stamped on `AllergyIntolerance.identifier`:
```json
{
  "identifier": [{ "system": "https://scriptsure.com/allergy-id", "value": "12345" }]
}
```

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
