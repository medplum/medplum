---
sidebar_position: 3
---

# Sync a Patient

:::caution[Beta]
The ScriptSure integration is in beta. Features and APIs may change.
:::

**Bot:** `scriptsure-patient-sync-bot`

Syncs a Medplum `Patient` to ScriptSure before opening the prescribing iFrame. This bot is idempotent and safe to call on every encounter.

What it does on each call:
1. Creates the patient in ScriptSure (or updates if already synced)
2. Pushes unsynced `AllergyIntolerance` resources (for drug-allergy interaction checks)
3. Pushes active `MedicationRequest` resources (for drug-drug interaction checks)
4. Catches up on missed prescription webhook events (mailbox drain)
5. Downloads medication history from SureScripts (if the patient has active consent)
6. Syncs preferred pharmacies as Medplum `Organization` resources

:::tip[React SDK]
If you're building a React app, use [`useScriptSureIFrame`](/docs/integration/scriptsure/iframe#react-hook-usescriptsureiframe) — it runs patient sync automatically before fetching the iFrame URL.
:::

## Patient resource requirements

The following fields are read during sync. ScriptSure will create the patient with empty strings for missing required fields, but name, DOB, and address are needed for accurate prescribing.

| Field | FHIR source |
|---|---|
| First / last name | `Patient.name[0].given[0]`, `Patient.name[0].family` |
| Date of birth | `Patient.birthDate` |
| Gender | `Patient.gender` (`male` → `M`, `female` → `F`, otherwise `U`) |
| Address | `Patient.address[0]` (line, city, state, postalCode) |
| Phone | `Patient.telecom` where `system = 'phone'` (`use` maps to home/work/cell) |
| Email | `Patient.telecom` where `system = 'email'` (optional) |

Phone numbers are normalized to 10 digits (leading `+1` stripped, non-digits removed).

## AllergyIntolerance sync

All `AllergyIntolerance` resources linked to the patient are pushed on first sync. Use RxNorm or NDC codes for accurate drug-allergy interaction (DAI) checking — the bot falls back to a freetext name match when no coded identifier is present.

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

## Input / output

**Input:**
```json
{ "patientId": "patient-xyz" }
```

**Success:**
```json
{ "scriptSurePatientId": 11111 }
```

**Provider not yet ready (EULA / identity proofing incomplete):**
```json
{ "skipped": true, "providerNotReady": true }
```

When `providerNotReady` is true, open the onboarding iFrame (omit `patientId` when calling `scriptsure-iframe-bot`) so the provider can complete enrollment.

## Example

```typescript
const result = await medplum.executeBot(
  { system: 'https://www.medplum.com/bots', value: 'scriptsure-patient-sync-bot' },
  { patientId: 'patient-xyz' }
);

if (result.providerNotReady) {
  // Open the onboarding iFrame — omit patientId
  return openIframe(await getIframeUrl(undefined));
}

// Proceed to open patient chart iFrame
```

```bash
medplum post \
  'Bot/$execute?identifier=https://www.medplum.com/bots|scriptsure-patient-sync-bot' \
  '{"patientId":"patient-xyz"}'
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
