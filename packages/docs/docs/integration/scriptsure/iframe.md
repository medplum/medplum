---
sidebar_position: 4
---

# Mount the iFrame

:::caution[Beta]
The ScriptSure integration is in beta. Features and APIs may change.
:::

**Bot:** `scriptsure-iframe-bot`

Generates an authenticated ScriptSure iframe URL for embedding the prescribing UI.

- **With `patientId`** (after patient sync): returns the patient's prescription chart URL.
- **Without `patientId`**: returns the provider onboarding URL (for EULA / identity proofing).

Always run `scriptsure-patient-sync-bot` before calling this bot when a `patientId` is available. If the patient sync returns `providerNotReady: true`, call this bot without `patientId` to open the onboarding UI.

## React hook: `useScriptSureIFrame`

The simplest way to mount the iframe in a React app. The hook runs patient sync and then fetches the iframe URL, handling the `providerNotReady` case automatically.

**Package:** `@medplum/scriptsure-react`

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
| `onIframeSuccess` | `(url: string) => void` | Called when the iframe URL is ready. |
| `onError` | `(err: unknown) => void` | Called on any error. |

---

## Direct bot invocation

If you need more control or are not using React, call the bots directly.

### Bot input

**Patient chart:**

```json
{ "patientId": "patient-xyz" }
```

**Provider onboarding (no patient context):**

```json
{}
```

### Bot output

```json
{
  "url": "https://ssa.scriptsure.com/v3/session/iframe/chart/11111?sessiontoken=..."
}
```

### SDK example

```typescript
const syncResult = await medplum.executeBot(
  { system: 'https://www.medplum.com/bots', value: 'scriptsure-patient-sync-bot' },
  { patientId }
);

const iframeResult = await medplum.executeBot(
  { system: 'https://www.medplum.com/bots', value: 'scriptsure-iframe-bot' },
  { patientId: syncResult.providerNotReady ? undefined : patientId }
);

// render <iframe src={iframeResult.url} />
```

### CLI example

```bash
# Patient chart URL
medplum post \
  'Bot/$execute?identifier=https://www.medplum.com/bots|scriptsure-iframe-bot' \
  '{"patientId":"patient-xyz"}'

# Onboarding URL
medplum post \
  'Bot/$execute?identifier=https://www.medplum.com/bots|scriptsure-iframe-bot' \
  '{}'
```
