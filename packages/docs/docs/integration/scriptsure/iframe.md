---
sidebar_position: 4
---

# Prescribing iFrame

:::caution[Beta]
The ScriptSure integration is in beta. Features and APIs may change.
:::

ScriptSure offers a fully hosted prescribing UI that can be embedded directly in your application as an authenticated iFrame. This is an alternative to building a custom prescribing flow using the ScriptSure APIs–rather than integrating drug search, order creation, and pharmacy management individually, the iFrame provides all of that in a single pre-built interface. It handles EULA acceptance, identity proofing, DDI/allergy checks, and prescription submission out of the box.

## React hook: `useScriptSureIFrame`

**Package:** `@medplum/scriptsure-react` · [GitHub Source Code](https://github.com/medplum/medplum/blob/main/packages/scriptsure-react/src/useScriptSureIFrame.ts)

Runs patient sync and fetches the iFrame URL in one call, handling the `providerNotReady` case automatically. Under the hood it calls `scriptsure-patient-sync-bot` followed by `scriptsure-iframe-bot`, falling back to the provider onboarding URL if the prescriber hasn't completed EULA or identity proofing.

```tsx
import { useScriptSureIFrame } from '@medplum/scriptsure-react';

function ScriptSureTab({ patientId }: { patientId: string }) {
  const iframeUrl = useScriptSureIFrame({
    patientId,
    onPatientSyncSuccess: () => console.log('patient synced'),
    onIframeSuccess: (url) => console.log('iframe ready', url),
    onError: (err) => console.error(err),
  });

  if (!iframeUrl) {
    return <div>Loading...</div>;
  }

  return <iframe src={iframeUrl} width="100%" height="800px" />;
}
```

**Options:**

| Option | Type | Description |
|---|---|---|
| `patientId` | `string \| undefined` | Medplum patient resource ID. Omit to open provider onboarding. |
| `onPatientSyncSuccess` | `() => void` | Called after patient sync completes. |
| `onIframeSuccess` | `(url: string) => void` | Called when the iFrame URL is ready. |
| `onError` | `(err: unknown) => void` | Called on any error. |

