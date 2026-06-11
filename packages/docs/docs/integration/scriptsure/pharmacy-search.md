---
sidebar_position: 7
---

# Pharmacy Search

:::caution[Beta]
The ScriptSure integration is in beta. Features and APIs may change.
:::

## React hook: `useScriptSurePharmacySearch`

**Package:** `@medplum/scriptsure-react` · [GitHub Source Code](https://github.com/medplum/medplum/blob/main/packages/scriptsure-react/src/useScriptSurePharmacySearch.ts)

Wraps `usePharmacySearch` with ScriptSure bot identifiers pre-configured. Exposes two methods: `searchPharmacies` to query the pharmacy directory and `addToFavorites` to save a pharmacy to a patient's profile.

```tsx
import { useState } from 'react';
import { useScriptSurePharmacySearch } from '@medplum/scriptsure-react';
import type { Organization } from '@medplum/fhirtypes';

function PharmacyPicker({ patientId }: { patientId: string }) {
  const { searchPharmacies, addToFavorites } = useScriptSurePharmacySearch();
  const [results, setResults] = useState<Organization[]>([]);

  async function handleSearch() {
    const pharmacies = await searchPharmacies({ zip: '94103', name: 'CVS' });
    setResults(pharmacies);
  }

  async function handleSelect(pharmacy: Organization) {
    await addToFavorites({ patientId, pharmacy, setAsPrimary: true });
  }

  return (
    <ul>
      {results.map((pharmacy, i) => (
        <li key={i}>
          {pharmacy.name}
          <button onClick={() => handleSelect(pharmacy)}>Add</button>
        </li>
      ))}
    </ul>
  );
}
```

## `searchPharmacies`

Calls `scriptsure-search-pharmacy-bot` and returns `Organization[]`. Supply at least one parameter to narrow results.

| Parameter | Type | Description |
|---|---|---|
| `name` | `string` | Pharmacy name |
| `city` | `string` | City |
| `state` | `string` | State |
| `zip` | `string` | ZIP code |
| `address` | `string` | Street address |
| `phoneOrFax` | `string` | Phone or fax number |
| `ncpdpID` | `string` | NCPDP ID for exact lookup |

## `addToFavorites`

Calls `scriptsure-add-patient-pharmacy-bot` and saves the pharmacy to the patient's profile.

| Parameter | Type | Description |
|---|---|---|
| `patientId` | `string` | Medplum `Patient` resource ID |
| `pharmacy` | `Organization` | FHIR `Organization` resource to add |
| `setAsPrimary` | `boolean` | Whether to set as the patient's primary pharmacy |

Returns `{ success: boolean, message: string, organization: Organization }`. If the provider is not yet enrolled, the pharmacy is saved locally and synced to ScriptSure on the next patient sync — `success` is still `true` in that case.
