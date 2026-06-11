---
sidebar_position: 5
---

# Order Medication

:::caution[Beta]
The ScriptSure integration is in beta. Features and APIs may change.
:::

## React hook: `useScriptSureOrderMedication`

**Package:** `@medplum/scriptsure-react` · [GitHub Source Code](https://github.com/medplum/medplum/blob/main/packages/scriptsure-react/src/useScriptSureOrderMedication.ts)

A thin wrapper around `useMedicationOrder` from `@medplum/react-hooks` that exposes two operations: drug search and order creation. The hook is vendor-neutral — the FHIR operations route to ScriptSure bots via `OperationDefinition`.

The patient must be synced before calling `orderMedication`. See [Sync a Patient](/docs/integration/scriptsure/sync-patient).

```tsx
import { useState } from 'react';
import { useScriptSureOrderMedication } from '@medplum/scriptsure-react';

function OrderMedicationPanel({ patientId }: { patientId: string }) {
  const { searchMedications, orderMedication } = useScriptSureOrderMedication();
  const [iframeUrl, setIframeUrl] = useState<string>();

  async function handleSearch() {
    const medications = await searchMedications({ term: 'lisinopril', searchGeneric: true });
    // medications is Medication[]
  }

  async function handleOrder() {
    const result = await orderMedication({
      patientId,
      pharmacyOrganizationId: 'org-123',
      diagnoses: [{ icdId: 'I10', name: 'Essential hypertension' }],
    });
    setIframeUrl(result.launchUrl); // render in an iframe for prescriber to review/sign
  }

  if (iframeUrl) {
    return <iframe src={iframeUrl} width="100%" height="800px" />;
  }

  return (
    <div>
      <button onClick={handleSearch}>Search</button>
      <button onClick={handleOrder}>Order</button>
    </div>
  );
}
```

## `searchMedications`

Calls `POST /fhir/R4/Medication/$drug-search`. Returns `Medication[]`.

| Parameter | Type | Description |
|---|---|---|
| `term` | `string` | Free-text drug search term |
| `ndc` | `string` | National Drug Code |
| `rxNorm` | `string` | RxNorm code |
| `routedMedId` | `number` | Vendor routed medication id |
| `searchOtc` | `boolean` | Include over-the-counter drugs |
| `searchSupply` | `boolean` | Include supplies |
| `searchBrand` | `boolean` | Include brand-name drugs |
| `searchGeneric` | `boolean` | Include generic drugs |
| `includeCode` | `boolean` | Include coding in returned `Medication` resources |
| `quantityQualifiers` | `boolean` | Return quantity qualifiers instead of `Medication[]` |

## `orderMedication`

Calls `POST /fhir/R4/MedicationRequest/$order-medication`. Creates or updates a draft `MedicationRequest` and returns a `launchUrl` to embed as an iframe for the prescriber to review and sign.

**Request fields:**

| Field | Type | Required | Description |
|---|---|---|---|
| `patientId` | `string` | yes | Medplum `Patient` resource id |
| `medicationRequestId` | `string` | | Existing draft `MedicationRequest` id to update |
| `drugs` | `MedicationOrderDrugInput[]` | | Drug lines for the order |
| `combinationMed` | `boolean` | | Whether the order is a combination medication |
| `compoundTitle` | `string` | | Title for a compound medication |
| `compoundQuantity` | `number` | | Total quantity for a compound medication |
| `compoundQuantityQualifier` | `string` | | Unit qualifier for compound quantity |
| `compoundSigs` | `{ sigOrder: number; line3: string; drugId?: number }[]` | | Sig lines for compound medications |
| `conditionIds` | `string[]` | | Medplum `Condition` resource ids |
| `coverageId` | `string` | | Medplum `Coverage` resource id |
| `payerOrganizationId` | `string` | | Medplum `Organization` resource id for the payer |
| `pharmacyOrganizationId` | `string` | | Medplum `Organization` resource id for the dispensing pharmacy |
| `pharmacyNcpdpId` | `string` | | NCPDP id of the dispensing pharmacy |
| `pharmacyName` | `string` | | Display name of the dispensing pharmacy |
| `diagnoses` | `{ icdId: string; name: string }[]` | | ICD diagnoses to associate with the order |
| `writtenDate` | `string` | | Date the prescription was written (FHIR date) |
| `fillDate` | `string` | | Requested fill date (FHIR date) |
| `durationDays` | `number` | | Days supply |
| `pharmacyNote` | `string` | | Notes to pharmacist |
| `patientInstruction` | `string` | | Free-text patient instructions |
| `appId` | `string` | | Vendor application id |

**Response fields:**

| Field | Type | Description |
|---|---|---|
| `orderId` | `number` | Vendor-side order id |
| `vendorPatientId` | `number` | Vendor-side patient id |
| `launchUrl` | `string` | iFrame URL for the prescriber to review and sign the order |
| `medicationRequestId` | `string` | Medplum `MedicationRequest` resource id created or updated |
| `pendingOrderStatus` | `'queued' \| 'reused'` | Whether the vendor pending order was newly queued or reused |
