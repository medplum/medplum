---
sidebar_position: 5
---

# Order Medication


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
| `routedMedId` | `number` | Vendor routed medication id — returns the drug's formulations |
| `gcnSeqnos` | `number[]` | Vendor formulation keys under `routedMedId`, taken from the name-search hit. Used only when the drug has no formulations; see below |
| `searchOtc` | `boolean` | Include over-the-counter drugs |
| `searchSupply` | `boolean` | Include supplies |
| `searchBrand` | `boolean` | Include brand-name drugs |
| `searchGeneric` | `boolean` | Include generic drugs |
| `includeCode` | `boolean` | Include coding in returned `Medication` resources |
| `quantityQualifiers` | `boolean` | Return quantity qualifiers instead of `Medication[]` |

### Drugs with no formulations

Some products — over-the-counter, topical, and multi-strength generics — have no rows in the
vendor's dose-format table, so a `routedMedId` search alone returns nothing even though the drug
exists and is prescribable. Each of the drug's formulation keys is a strength, so passing them
resolves the strengths individually:

```ts
const strengths = await searchMedications({ routedMedId: 6143, gcnSeqnos: [8346, 22528, 22530] });
```

A name-search `Medication` carries one `https://scriptsure.com/gcn-seqno` identifier per key, so
the caller can read them straight off the search hit. Expect fewer results than keys passed —
discontinued formulations resolve to nothing and are omitted. These results carry a dispensable
NDC but no pre-built sig lines, so the caller supplies the quantity and directions.

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

**`MedicationOrderDrugInput` (one per `drugs[]` entry):**

| Field | Type | Required | Description |
|---|---|---|---|
| `quantity` | `number` | yes | Quantity to dispense |
| `ndc` | `string` | | National Drug Code — preferred drug identifier |
| `rxNorm` | `string` | | RxNorm code |
| `routedMedId` | `number` | | Vendor routed medication id |
| `gcnSeqno` | `number` | | Vendor formulation key. Pair with `routedMedId` to order a drug that has no dose-level formulation to resolve an NDC from. Usually resolves to a real NDC anyway — see [Drugs with no formulations](#drugs-with-no-formulations) — so this is a fallback for the rare product with no marketed package |
| `drugName` | `string` | | Drug name. Required with `gcnSeqno`, since there is no dose-level record to derive it from |
| `line1` | `string` | | Dose text for a `gcnSeqno`-keyed line, e.g. `"solution"`. Only send it when you hold dose text separate from `drugName`, such as a hand-entered form; a full product label duplicates itself in the rendered description. Omitted by both built-in order paths |
| `quantityQualifier` | `string` | | NCI unit code for the quantity (e.g. `C48542` tablet) |
| `refill` | `number` | | Number of refills |
| `drugOrder` | `number` | | 1-based position within the order |
| `sigLine3` | `string` | | Patient directions (sig) |
| `useSubstitution` | `boolean` | | Whether generic substitution is allowed |

Supply exactly one drug identity per line: `ndc`, `rxNorm`, or `routedMedId` (+ `gcnSeqno` when the drug has no formulations).

:::note
A line keyed on `gcnSeqno` with no NDC is only prescribable through this operation: cart checkout
(`$checkout-medications`) accepts one, but the vendor's cart UI leaves it incomplete and the
prescriber cannot send it. This applies only when no NDC could be resolved at all — see
[Drugs with no formulations](#drugs-with-no-formulations).
:::

**Response fields:**

| Field | Type | Description |
|---|---|---|
| `orderId` | `number` | Vendor-side order id |
| `vendorPatientId` | `number` | Vendor-side patient id |
| `launchUrl` | `string` | iFrame URL for the prescriber to review and sign the order |
| `medicationRequestId` | `string` | Medplum `MedicationRequest` resource id created or updated |
| `pendingOrderStatus` | `'queued' \| 'reused'` | Whether the vendor pending order was newly queued or reused |
