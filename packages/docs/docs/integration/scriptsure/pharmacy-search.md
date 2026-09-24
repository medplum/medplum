---
sidebar_position: 7
---

# Pharmacy Search

Patients can choose a pharmacy during onboarding, and clinicians can add, replace, or remove that preference later. This page covers directory search and the patient-pharmacy operations.

:::note[Bot deployment prerequisite]
Backend search with an admin fallback, conditional pharmacy reuse, and the removal/replacement bot require those capabilities in your project's deployed ScriptSure bots. Confirm they are available in the environment you call. Updating the Medplum server or deploying to a different project does not update these bots.
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

### Search from a backend

Pharmacy search uses a linked user's ScriptSure session when available. The bot reads the ScriptSure user identifier from `ProjectMembership.identifier`, matching the configured `SCRIPTSURE_PLATFORM_URL`, and the first `Practitioner.telecom` entry whose `system` is `email`.

If that user context is missing, a backend caller such as a `ClientApplication` can use the project-admin fallback, as drug search does. Configure the ScriptSure vendor secrets (`SCRIPTSURE_API_KEY`, `SCRIPTSURE_SECRET`, `SCRIPTSURE_PLATFORM_URL`, `SCRIPTSURE_API_URL`, and `SCRIPTSURE_IFRAME_URL`), plus `SCRIPTSURE_ADMIN_EMAIL` and a valid practice context. `SCRIPTSURE_ADMIN_USER_ID` is optional; the admin client can resolve it by email. Keep these credentials in project secrets, never in browser code.

Search results are in-memory `Organization` resources; searching does not save them. The fallback applies to directory search. It does not replace the user and practice context required for patient writes. See [Account Setup](/docs/integration/scriptsure/account-setup) and [Multiple Practice Locations](/docs/integration/scriptsure/multiple-locations).

## `addToFavorites`

Calls `scriptsure-add-patient-pharmacy-bot` and saves the pharmacy to the patient's profile.

| Parameter | Type | Description |
|---|---|---|
| `patientId` | `string` | Medplum `Patient` resource ID |
| `pharmacy` | `Organization` | FHIR `Organization` resource to add |
| `setAsPrimary` | `boolean` | Whether to set as the patient's primary pharmacy |

Returns `{ success: boolean, message: string, organization: Organization }`. `success: true` means the local preference was saved; inspect `message` for a skipped or failed ScriptSure update. If the patient is not yet synced or the provider is not ready, [patient sync](/docs/integration/scriptsure/sync-patient#preferred-pharmacy-sync) can later push a locally saved pharmacy that is missing from ScriptSure.

`setAsPrimary: true` makes the selected pharmacy primary and retains the previous primary as a preferred pharmacy. Use the removal/replacement bot below when the old pharmacy should leave the patient's list.

The add and sync bots reuse pharmacy Organizations by their seven-digit NCPDP identifier, including the legacy `https://scriptsure.com/pharmacy-id` identifier. Conditional creation prevents concurrent calls from creating separate records for the same visible match. All callers must be able to search the shared directory. Multiple existing matches produce an error and require consolidation; the bots do not automatically merge duplicates. See [Sharing pharmacy Organizations](/docs/integration/scriptsure/multiple-locations#sharing-pharmacy-organizations).

The add bot version-checks its Patient update. If another edit wins, the request fails before the vendor update; reload the patient and retry the intended change.

## Remove or replace a preferred pharmacy

**Bot:** `scriptsure-remove-patient-pharmacy-bot`

This bot removes the patient's pharmacy association in Medplum and ScriptSure. It never deletes the pharmacy Organization, which other patients may share.

Input fields:

- `patientId`: required Medplum Patient ID.
- `pharmacyOrganizationId`: required ID of the existing pharmacy Organization to remove.
- `replacementPharmacyOrganizationId`: optional ID of an existing pharmacy Organization to use instead. Its NCPDP ID must differ from the old pharmacy's.
- `organizationId`: optional selected ScriptSure practice Organization ID. See [practice resolution](/docs/integration/scriptsure/multiple-locations#how-the-practice-is-resolved-per-request).

The replacement inherits primary status when the removed pharmacy was primary. Replacing a non-primary preference does not promote the replacement. Omitting the replacement removes the association without automatically choosing another local primary.

The following function assumes an authenticated `MedplumClient` with permission to execute the bot, read/update the Patient, and read its referenced pharmacy Organizations. Pass real Medplum resource IDs. Omit `replacementPharmacyOrganizationId` to remove without replacing.

```typescript
import type { MedplumClient } from '@medplum/core';

export async function removePreferredPharmacy(
  medplum: MedplumClient,
  patientId: string,
  pharmacyOrganizationId: string,
  replacementPharmacyOrganizationId?: string,
  organizationId?: string
): Promise<void> {
  const result = await medplum.executeBot(
    { system: 'https://www.medplum.com/bots', value: 'scriptsure-remove-patient-pharmacy-bot' },
    { patientId, pharmacyOrganizationId, replacementPharmacyOrganizationId, organizationId }
  );
  if (!result.success) {
    throw new Error(result.message);
  }
}
```

A successful response has `success: true`. `vendorSync` is `complete` when the vendor operations completed, or `not-required` when the Patient has no ScriptSure patient ID and only the local preference changed.

### Handle partial failures

For a synced Patient, the bot updates ScriptSure first, then saves the Patient with a version check. A normal response can still contain `success: false`:

- `failedStage: 'vendor'` and `vendorSync: 'unknown'`: local preferences are unchanged, but some vendor steps may have completed.
- `failedStage: 'patient-update'`: the local write failed. `vendorSync: 'complete'` means the vendor changed while the Patient still needs updating; `not-required` means this was a local-only operation.

Resolve the reported cause and retry the same request before running patient sync. Validation and resource-read failures can also reject the request, so handle thrown errors as well as `success: false`.

Do not run removal/replacement concurrently with patient sync for the same patient. There is no transaction spanning Medplum and ScriptSure, and sync can re-add an association during a partial update. Removing only a local extension or only the vendor association is insufficient for a lasting removal.
