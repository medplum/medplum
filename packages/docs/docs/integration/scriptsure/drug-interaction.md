---
sidebar_position: 6
---

# Drug Interaction Check

:::caution[Beta]
The ScriptSure integration is in beta. Features and APIs may change.
:::

**Bot:** `scriptsure-drug-interaction-bot`

Checks one or more candidate drugs for drug-drug interactions (DDI) against a patient's current medication list in ScriptSure. Two modes are supported:

- **`check`** (default) — lightweight DDI list
- **`details`** — full FDB screening payload per candidate including allergy, age, and duplicate-therapy checks

If the prescriber has not completed ScriptSure EULA or identity proofing, returns `{ interactions: [], skipped: true, providerNotReady: true }` rather than throwing.

```typescript
const result = await medplum.executeBot(
  { system: 'https://www.medplum.com/bots', value: 'scriptsure-drug-interaction-bot' },
  {
    patientId: 'patient-xyz',
    candidateRoutedMedIds: [12345, 67890], // ScriptSure ROUTED_MED_ID integers
    mode: 'check',       // 'check' (default) or 'details'
    timeframeDays: 365,  // optional, defaults to 365
  }
);
```

## Input fields

| Field | Type | Description |
|---|---|---|
| `patientId` | `string` | Medplum `Patient` resource ID |
| `candidateRoutedMedIds` | `number[]` | ScriptSure `ROUTED_MED_ID` integers for the drugs to check |
| `mode` | `'check' \| 'details'` | Interaction check mode. Defaults to `'check'` |
| `timeframeDays` | `number` | Lookback window for current medications. Defaults to `365` |

## Response fields

All modes return the same top-level shape:

| Field | Type | Description |
|---|---|---|
| `interactions` | `DrugInteraction[]` | DDI results. Empty array in `details` mode and when the provider is not ready. |
| `skipped` | `boolean` | `true` when the check was skipped because the provider has not completed EULA or identity proofing. |
| `providerNotReady` | `boolean` | `true` alongside `skipped` when the provider is not yet enrolled. |
| `details` | `Record<string, unknown>[]` | `details` mode only. One full FDB drugcheck response object per successfully resolved candidate. Shape varies by FDB version. |
| `detailsErrors` | `{ routedMedId: number; message: string }[]` | `details` mode only. Per-candidate resolution failures. Sibling candidates are still processed. |

Each `interactions` item (`check` mode):

| Field | Type | Description |
|---|---|---|
| `ROUTED_MED_ID` | `number` | The candidate drug that has an interaction |
| `DDI_DES` | `string` | Interaction description (e.g. `"LOOP DIURETICS/DESMOPRESSIN"`) |
| `DDI_SL` | `string` | Severity level code (FDB-defined; treat as opaque string) |
