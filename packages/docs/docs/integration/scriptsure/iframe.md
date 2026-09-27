---
sidebar_position: 4
---

# Prescribing iFrame


ScriptSure offers a fully hosted prescribing UI that can be embedded directly in your application as an authenticated iFrame. This is an alternative to building a custom prescribing flow using the ScriptSure APIs–rather than integrating drug search, order creation, and pharmacy management individually, the iFrame provides all of that in a single pre-built interface. It handles EULA acceptance, identity proofing, DDI/allergy checks, and prescription submission out of the box.

## React hook: `useScriptSureIFrame`

**Package:** `@medplum/scriptsure-react` · [GitHub Source Code](https://github.com/medplum/medplum/blob/main/packages/scriptsure-react/src/useScriptSureIFrame.ts)

Runs patient sync and fetches the iFrame URL in one call, allowing the provider onboarding flow when sync returns `providerNotReady`. Under the hood it calls `scriptsure-patient-sync-bot` followed by `scriptsure-iframe-bot`, falling back to the provider onboarding URL if the prescriber hasn't completed EULA or identity proofing.

```tsx
import { useScriptSureIFrame } from '@medplum/scriptsure-react';
import { useState } from 'react';

function ScriptSureTab({ patientId }: { patientId: string }) {
  const [syncFailed, setSyncFailed] = useState(false);
  const iframeUrl = useScriptSureIFrame({
    patientId,
    onPatientSyncSuccess: () => console.log('patient synced'),
    onIframeSuccess: (url) => console.log('iframe ready', url),
    onError: () => setSyncFailed(true),
  });

  if (syncFailed) {
    return <div role="alert">Patient sync or prescribing setup failed. Resolve the error before reopening prescribing.</div>;
  }

  if (!iframeUrl) {
    return <div>Loading...</div>;
  }

  return <iframe src={iframeUrl} width="100%" height="800px" />;
}
```

Handle `onError` in your UI; logging the error alone can leave the user looking at an indefinite loading indicator. A rejected patient sync stops this hook from calling the iframe bot for that run. Earlier sync stages may already have saved data. See [incomplete sync and throttling](/docs/integration/scriptsure/sync-patient#handling-incomplete-sync) for recovery steps.

Remount the example component when switching patients or explicitly retrying after resolving an error, so its error and iframe state belong to the current attempt. For example, a parent can supply a React `key` derived from the patient ID and an attempt counter. Do not retry automatically on every render.

Patient sync does not upload the patient's `Condition` resources into the iframe diagnosis list. Allergies require a successful sync; opening an iframe URL directly does not synchronize them.

**Options:**

| Option | Type | Description |
|---|---|---|
| `patientId` | `string \| undefined` | Medplum patient resource ID. Omit to open provider onboarding. |
| `onPatientSyncSuccess` | `() => void` | Called when the sync bot returns successfully, including an onboarding skip. |
| `onIframeSuccess` | `(url: string) => void` | Called when the iFrame URL is ready. |
| `onError` | `(err: unknown) => void` | Called on any error. |

