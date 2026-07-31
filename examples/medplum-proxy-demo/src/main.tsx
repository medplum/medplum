// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { MantineProvider } from '@mantine/core';
import '@mantine/core/styles.css';
import { Notifications } from '@mantine/notifications';
import '@mantine/notifications/styles.css';
import { MedplumClient } from '@medplum/core';
import { MedplumProvider } from '@medplum/react';
import '@medplum/react/styles.css';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App';

// This client never logs in. It has no client ID, secret, or access token, and no
// `onUnauthenticated` redirect. `baseUrl` points at the local proxy server (see ../server/proxy.ts),
// which is responsible for authenticating every request with its own Medplum M2M client credentials
// before forwarding it to the real Medplum server. From the browser's point of view, the FHIR API
// is simply open — there is nothing to sign in to.
const medplum = new MedplumClient({
  baseUrl: import.meta.env.MEDPLUM_PROXY_URL,
});

const container = document.getElementById('root') as HTMLDivElement;
const root = createRoot(container);
root.render(
  <StrictMode>
    <MedplumProvider medplum={medplum}>
      <MantineProvider>
        <Notifications />
        <App />
      </MantineProvider>
    </MedplumProvider>
  </StrictMode>
);
