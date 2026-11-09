---
id: index
title: React Components
description: Set up Medplum React components, providers, styles, and compatible dependencies.
---

Use Medplum's React library to add FHIR forms, search interfaces, and clinical workspaces to your application. The same components power the Medplum App and Provider.

Choose a starting point:

- **Start a small app:** use [Medplum Hello World](https://github.com/medplum/medplum/tree/main/examples/medplum-hello-world), which includes sign-in and patient pages.
- **Customize a clinical app:** start with [Medplum Provider](/docs/provider#building-a-custom-ehr).
- **Add components to an existing app:** follow the setup below, then continue with [Building a React Application](/docs/react/building-an-application).

Explore the [component catalog](https://storybook.medplum.com/) and [public source](https://github.com/medplum/medplum/tree/main/packages/react) as you build.

## Prerequisites

Use compatible versions of React, Mantine, and the Medplum packages. The current `@medplum/react` package supports React 18 or 19 and requires Mantine 8. Keep `@medplum/core`, `@medplum/react`, and `@medplum/react-hooks` on the same Medplum release.

For a new app using React 19:

```bash
npm install react@^19 react-dom@^19 react-router@^8
npm install @mantine/core@^8 @mantine/hooks@^8 @mantine/notifications@^8 @mantine/spotlight@^8
npm install @medplum/core @medplum/react @medplum/react-hooks jsqr signature_pad@^5
npm install -D @medplum/fhirtypes @types/react @types/react-dom postcss postcss-preset-mantine postcss-simple-vars
```

The PostCSS packages are development tools; the React, Mantine, and Medplum packages are application dependencies. `postcss-simple-vars` is required by the configuration below.

For an existing app, check the peer dependencies of the Medplum version you are installing before changing framework versions. Use the maintained [Hello World example](https://github.com/medplum/medplum/tree/main/examples/medplum-hello-world) as a complete starting point.

## Getting Started

After installing the packages, continue with [Building a React Application](/docs/react/building-an-application) for authentication state, data loading, forms, and refresh behavior. [Choosing React Components](/docs/react/choosing-components) maps common workflows to controls and working examples.

If you are not familiar with Mantine, you may want to start with the [Mantine Getting Started](https://mantine.dev/getting-started/) guide.

Configure PostCSS, then load the styles and providers in your application entry point.

### PostCSS Configuration

Create a `postcss.config.mjs` file in the root of your project:

```javascript
import mantinePreset from 'postcss-preset-mantine';
import simpleVars from 'postcss-simple-vars';

const config = {
  plugins: [
    mantinePreset(),
    simpleVars({
      variables: {
        'mantine-breakpoint-xs': '36em',
        'mantine-breakpoint-sm': '48em',
        'mantine-breakpoint-md': '62em',
        'mantine-breakpoint-lg': '75em',
        'mantine-breakpoint-xl': '88em',
      },
    }),
  ],
};

export default config;
```

### Styles and providers {#mantine-imports}

Load Mantine's styles before Medplum's styles. Wrap your pages with `MedplumProvider` for client and authentication state, and `MantineProvider` for UI theming. Keep the `MedplumClient` instance outside the render function so it stays stable across renders.

## Simple Example

In your application entry point, replace `YOUR_CLIENT_ID` with your public ClientApplication ID and render your `App` component. The example uses Medplum's hosted API; if you self-host, set `baseUrl` to your own Medplum server URL. Hello World reads this value from `import.meta.env.MEDPLUM_BASE_URL`.

```tsx
import { MantineProvider } from '@mantine/core';
import '@mantine/core/styles.css';
import { MedplumClient } from '@medplum/core';
import { MedplumProvider } from '@medplum/react';
import '@medplum/react/styles.css';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router';
import { App } from './App';

const medplum = new MedplumClient({
  baseUrl: 'https://api.medplum.com/',
  clientId: 'YOUR_CLIENT_ID',
});

const container = document.getElementById('root') as HTMLDivElement;
createRoot(container).render(
  <StrictMode>
    <BrowserRouter>
      <MedplumProvider medplum={medplum}>
        <MantineProvider>
          <App />
        </MantineProvider>
      </MedplumProvider>
    </BrowserRouter>
  </StrictMode>
);
```

{{< note title="Keep client secrets on the server" >}}
A browser app uses a public client ID. Configure a browser-compatible [sign-in flow](/docs/auth); client secrets belong in a trusted backend.
{{< /note >}}

The providers establish the application context. Continue with [Building a React Application](/docs/react/building-an-application) to handle sign-in state, searches, saves, and refreshes.
