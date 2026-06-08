---
sidebar_position: 8
---

# Order Sets

:::caution[Beta]
The ScriptSure integration is in beta. Features and APIs may change.
:::

Order sets allow you to embed a pre-configured prescribing widget for a group of medications defined in a ScriptSure orderset. The orderset can be mapped to a Medplum `PlanDefinition` resource or referenced directly by its ScriptSure ID.

Before rendering an order set, ensure ordersets have been synced via `scriptsure-orderset-sync-bot` (ongoing sync) or imported via `scriptsure-orderset-import-bot` (one-time backfill).

## React hook: `useScriptSureOrderSet`

**Package:** `@medplum/scriptsure-react` · [GitHub Source Code](https://github.com/medplum/medplum/blob/main/packages/scriptsure-react/src/useScriptSureOrderSet.ts)

Calls `POST /fhir/R4/PlanDefinition/$order-set-url` to resolve the authenticated iFrame URL for the order set prescribing widget. The hook stays idle until `patientId` is set.

```tsx
import { useScriptSureOrderSet } from '@medplum/scriptsure-react';

function OrderSetTab({ patientId, planDefinitionId }: { patientId: string; planDefinitionId: string }) {
  const { url, loading, error, refresh } = useScriptSureOrderSet({ patientId, planDefinitionId });

  if (loading) return <div>Loading...</div>;
  if (error) return <div>Error loading order set</div>;
  if (!url) return null;

  return <iframe src={url} width="100%" height="800px" />;
}
```

**Options:**

| Option | Type | Description |
|---|---|---|
| `patientId` | `string \| undefined` | Medplum patient resource ID. Hook is idle until set. |
| `planDefinitionId` | `string` | Medplum `PlanDefinition` ID — bot resolves this to a ScriptSure orderset ID. |
| `scriptSureOrdersetId` | `number` | ScriptSure orderset ID directly. Use when no `PlanDefinition` exists. |
| `appId` | `string` | Optional app identifier. |

Either `planDefinitionId` or `scriptSureOrdersetId` must be provided.

**Returns:**

| Field | Type | Description |
|---|---|---|
| `url` | `string \| undefined` | Authenticated iFrame URL for the order set widget. |
| `loading` | `boolean` | `true` while the URL is being fetched. |
| `error` | `unknown` | Set if the request fails. |
| `refresh` | `() => Promise<string \| undefined>` | Re-fetches the URL. Safe to call repeatedly — useful for refreshing session tokens. |

## Creating an order set

An order set is a `PlanDefinition` resource with `type.coding[0].code = "order-set"`, plus one `ActivityDefinition` per medication line. Each `PlanDefinition.action` references its `ActivityDefinition` by canonical URL.

The bundle below is a minimal working example — a geriatric type 2 diabetes starter pack. The bundle type is `collection`; before posting, convert it to a `transaction` bundle (e.g. via `convertToTransactionBundle` from `@medplum/core`) and then execute it with `medplum.executeBatch()`, which posts to `POST /fhir/R4`.

<details>
<summary>Example order set bundle (`PlanDefinition` + `ActivityDefinition`)</summary>

```json
{
  "resourceType": "Bundle",
  "type": "collection",
  "identifier": {
    "system": "https://medplum.com/demo-export",
    "value": "orderset/geriatric-t2dm-starter/1.0.1"
  },
  "entry": [
    {
      "resource": {
        "resourceType": "ActivityDefinition",
        "url": "https://medplum.com/ActivityDefinition/metformin-500-mg-tablet",
        "version": "1.0.1",
        "status": "active",
        "kind": "MedicationRequest",
        "title": "Metformin 500 mg tablet",
        "productCodeableConcept": {
          "coding": [{ "system": "http://www.nlm.nih.gov/research/umls/rxnorm", "code": "861007" }],
          "text": "Metformin 500 mg tablet"
        },
        "quantity": { "value": 60, "unit": "Tablet" },
        "dosage": [{
          "text": "Take 1 tablet by mouth twice daily with meals.",
          "doseAndRate": [{ "doseQuantity": { "value": 1, "unit": "Tablet" } }],
          "timing": { "repeat": { "frequency": 2, "period": 1, "periodUnit": "d" } }
        }]
      }
    },
    {
      "resource": {
        "resourceType": "PlanDefinition",
        "url": "https://medplum.com/PlanDefinition/geriatric-t2dm-starter",
        "version": "1.0.1",
        "name": "GeriatricT2dmStarter",
        "title": "Geriatric Type 2 Diabetes Starter Pack",
        "status": "active",
        "type": {
          "coding": [{ "system": "http://terminology.hl7.org/CodeSystem/plan-definition-type", "code": "order-set" }]
        },
        "action": [
          {
            "title": "Metformin 500 mg tablet",
            "definitionCanonical": "https://medplum.com/ActivityDefinition/metformin-500-mg-tablet|1.0.1"
          }
        ]
      }
    }
  ]
}
```

</details>

After importing, sync the `PlanDefinition` to ScriptSure via `scriptsure-orderset-sync-bot` with the resource ID.

See the full three-medication example bundle (Metformin + Empagliflozin + Sitagliptin) in the [Medplum Provider demo app](https://github.com/medplum/medplum/blob/main/examples/medplum-provider/src/data/order-set-example-bundle.json). The provider app's **Get Started** page includes an **Import Order Set** button ([`GetStartedPage.tsx`](https://github.com/medplum/medplum/blob/2777aed0f7cbc68e8d3afd40c01e87c57168fdfb/examples/medplum-provider/src/pages/getstarted/GetStartedPage.tsx#L125)) that converts the collection bundle, posts it as a transaction, and syncs the resulting `PlanDefinition` — useful as a reference implementation for your own import flow.
