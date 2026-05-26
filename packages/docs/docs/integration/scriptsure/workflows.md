---
sidebar_position: 5
---

# Workflows

:::caution[Beta]
The ScriptSure integration is in beta. Features and APIs may change.
:::

Common end-to-end flows showing how the bots and hooks work together.

---

## Opening the prescribing iFrame for a patient encounter

Covers: [Sync a Patient](/docs/integration/scriptsure/sync-patient) · [Mount the iFrame](/docs/integration/scriptsure/iframe)

```
1. Call scriptsure-patient-sync-bot  { patientId }

   The bot automatically:
   - Creates/updates the patient in ScriptSure
   - Syncs allergies (for DAI checks) and medications (for DDI checks)
   - Drains missed webhook events
   - Downloads drug history if consent is active
   - Syncs preferred pharmacies

   → If providerNotReady: true  →  go to "Provider not ready" workflow below
   → If scriptSurePatientId returned  →  continue to step 2

2. Call scriptsure-iframe-bot  { patientId }
   → { url: "https://ssa.scriptsure.com/...?sessiontoken=..." }

3. Render <iframe src={url} />
```

:::tip[React SDK]
`useScriptSureIFrame({ patientId })` from `@medplum/scriptsure-react` handles steps 1–3 automatically.
:::

---

## Provider not ready (EULA / identity proofing incomplete)

Covers: [Sync a Patient](/docs/integration/scriptsure/sync-patient) · [Mount the iFrame](/docs/integration/scriptsure/iframe)

A prescriber must complete EULA acceptance and ID.me identity proofing before their first prescription. This happens inside the ScriptSure iFrame, so no separate portal login is required.

```
1. Call scriptsure-patient-sync-bot  { patientId }
   → { skipped: true, providerNotReady: true }

2. Call scriptsure-iframe-bot  {}  (no patientId)
   → { url: "https://ssa.scriptsure.com/...onboarding..." }

3. Render <iframe src={url} />
   Provider completes EULA and identity proofing inside the iFrame.

4. Once complete, retry from step 1 — patient sync will now succeed.
```

The `scriptsure-iframe-bot` always returns a URL when called without a `patientId` and never throws when the provider is not ready, making it safe to use as the onboarding entry point.
