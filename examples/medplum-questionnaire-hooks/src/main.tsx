// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { MedplumClient } from '@medplum/core';
import { MedplumProvider } from '@medplum/react-hooks';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App';

const medplum = new MedplumClient({
  baseUrl: import.meta.env.MEDPLUM_BASE_URL,
});

function setEnvironmentFavicon(): void {
  const { hostname } = window.location;
  if (hostname === 'medplum.com' || hostname.endsWith('.medplum.com')) {
    return;
  }
  const isLocal = /^(localhost|127\.0\.0\.1)$/.test(hostname) || /\.local(host)?$/.test(hostname);
  const link = document.querySelector<HTMLLinkElement>('link[rel="icon"]');
  if (link) {
    link.href = isLocal ? '/favicon-local.ico' : '/favicon-staging.ico';
  }
}

setEnvironmentFavicon();

createRoot(document.getElementById('root') as HTMLDivElement).render(
  <StrictMode>
    <MedplumProvider medplum={medplum}>
      <App />
    </MedplumProvider>
  </StrictMode>
);
