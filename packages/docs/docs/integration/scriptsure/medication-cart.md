---
sidebar_position: 9
---

# Medication Cart

:::caution[Beta]
The ScriptSure integration is in beta. Features and APIs may change.
:::

The MedCart flow lets a clinician stage several prescriptions during one encounter and approve them all in a single signing session—instead of opening a separate widget per drug. The flow is:

1. **Add** draft `MedicationRequest`s to the cart one at a time as the clinician selects drugs.
2. **Checkout**—stage all drafts on ScriptSure's MedCart and get back a single widget URL.
3. Prescriber opens the widget, reviews every drug, and signs them all at once.
4. **Remove** or **clear** if the clinician changes their mind before signing.

The patient must be synced before calling `checkout`. See [Sync a Patient](/docs/integration/scriptsure/sync-patient).

## React hook: `useScriptSureCart`

**Package:** `@medplum/scriptsure-react` · [GitHub Source Code](https://github.com/medplum/medplum/blob/main/packages/scriptsure-react/src/useScriptSureCart.ts)

A thin wrapper around `useMedicationCart` from `@medplum/react-hooks` that exposes all cart operations in a single hook.

```tsx
import { useState } from 'react';
import { useScriptSureCart } from '@medplum/scriptsure-react';
import type { MedicationRequest } from '@medplum/fhirtypes';

function CartPanel({ patientId }: { patientId: string }) {
  const { addToCart, adding, checkout, removeFromCart, clearCart } = useScriptSureCart();
  const [approvalUrl, setApprovalUrl] = useState<string>();
  const [draftIds, setDraftIds] = useState<string[]>([]);

  async function handleAdd(medicationRequest: MedicationRequest) {
    const created = await addToCart(medicationRequest);
    setDraftIds((prev) => [...prev, created.id!]);
  }

  async function handleCheckout() {
    const result = await checkout({ patientId, medicationRequestIds: draftIds });
    const queued = result.items.filter((i) => i.status === 'queued');
    if (queued.length > 0) {
      setApprovalUrl(result.approvalUrl);
    }
  }

  if (approvalUrl) {
    return <iframe src={approvalUrl} width="100%" height="800px" />;
  }

  return (
    <div>
      <button onClick={handleCheckout} disabled={adding || draftIds.length === 0}>
        Review &amp; sign all ({draftIds.length})
      </button>
      <button onClick={() => clearCart({ patientId })}>Clear cart</button>
    </div>
  );
}
```

## `addToCart`

Creates a draft `MedicationRequest` in Medplum via plain FHIR `createResource`—no custom operation is called. Vendor staging (ScriptSure MedCart) happens later at `checkout`. The `adding` flag is `true` while any `addToCart` call is in flight; `checkout` refuses to proceed while `adding` is `true`.

**Parameters:**

| Parameter | Type | Description |
|---|---|---|
| `medicationRequest` | `MedicationRequest` | The draft `MedicationRequest` to persist. Should have `status: 'draft'` and `intent: 'order'`. |

**Returns:** `Promise<MedicationRequest>`—the created resource with its Medplum-assigned `id`.

## `checkout`

Calls `POST /fhir/R4/MedicationRequest/$checkout-medications`. Stages each draft on ScriptSure's MedCart and returns a single widget URL where the prescriber reviews and signs all medications at once.

Per-line failures are returned in `items` rather than thrown—check `items[].status` before opening the widget. Each successfully staged draft is stamped with a `medcart-rx-id` identifier and `pending-order-status: in-cart`. When the prescriber sends from the widget, the prescription webhook bot reconciles each draft to `active`.

**Request fields:**

| Field | Type | Required | Description |
|---|---|---|---|
| `patientId` | `string` | yes | Medplum `Patient` resource id |
| `medicationRequestIds` | `string[]` | yes | Draft `MedicationRequest` ids to stage |
| `appId` | `string` | | Optional MedCart widget template id |

**Response fields:**

| Field | Type | Description |
|---|---|---|
| `approvalUrl` | `string` | MedCart widget URL—embed as an iframe for the prescriber to review and sign all staged items |
| `vendorPatientId` | `number` | Vendor-side patient id |
| `items` | `MedicationCheckoutItemResult[]` | Per-line result (see below). Always returned even when some lines failed. |

Each `items` entry:

| Field | Type | Description |
|---|---|---|
| `medicationRequestId` | `string` | Medplum `MedicationRequest` id |
| `vendorLineId` | `string` | MedCart `rxId` for the staged item |
| `status` | `'queued' \| 'failed'` | `queued` = successfully staged; `failed` = see `error` |
| `duplicate` | `boolean` | `true` when the drug was already in the MedCart; the existing item is reused |
| `error` | `string` | Present when `status === 'failed'` |

:::note
Do not open the `approvalUrl` if every item has `status: 'failed'`.
:::

## `removeFromCart`

Calls `POST /fhir/R4/MedicationRequest/$remove-cart-medication`. Removes one item from the MedCart and deletes the corresponding draft `MedicationRequest` from Medplum.

**Request fields:**

| Field | Type | Required | Description |
|---|---|---|---|
| `patientId` | `string` | yes | Medplum `Patient` resource id |
| `medicationRequestId` | `string` | yes | Draft `MedicationRequest` id to remove |

**Response fields:**

| Field | Type | Description |
|---|---|---|
| `vendorPatientId` | `number` | Vendor-side patient id |
| `removedCount` | `number` | Number of items successfully removed (`0` or `1`) |
| `items` | `MedicationCartItemResult[]` | Single-item array with `status: 'removed'` or `status: 'failed'` |

## `clearCart`

Calls `POST /fhir/R4/MedicationRequest/$clear-cart`. Removes every item from the MedCart and deletes all draft `MedicationRequest`s for the patient. Per-line failures are returned in `items` rather than thrown—failed drafts are kept so the caller can retry.

**Request fields:**

| Field | Type | Required | Description |
|---|---|---|---|
| `patientId` | `string` | yes | Medplum `Patient` resource id |

**Response fields:**

| Field | Type | Description |
|---|---|---|
| `vendorPatientId` | `number` | Vendor-side patient id |
| `removedCount` | `number` | Number of items successfully removed |
| `items` | `MedicationCartItemResult[]` | Per-line result with `status: 'removed'` or `status: 'failed'` |
