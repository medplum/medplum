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
  if (import.meta.env.MEDPLUM_ENVIRONMENT_FAVICON !== 'true') {
    return;
  }
  const { hostname } = window.location;
  if (hostname === 'medplum.com' || hostname.endsWith('.medplum.com')) {
    return;
  }
  const isLocal =
    /^(localhost|127\.0\.0\.1|0\.0\.0\.0)$/.test(hostname) ||
    /^192\.168\./.test(hostname) ||
    /\.local(host)?$/.test(hostname);
  document.querySelector<HTMLLinkElement>('link[rel="icon"]')?.remove();
  const link = document.createElement('link');
  link.rel = 'icon';
  link.type = 'image/x-icon';
  link.href = isLocal ? '/favicon-local.ico' : '/favicon-staging.ico';
  document.head.appendChild(link);
}

setEnvironmentFavicon();

createRoot(document.getElementById('root') as HTMLDivElement).render(
  <StrictMode>
    <MedplumProvider medplum={medplum}>
      <App />
    </MedplumProvider>
  </StrictMode>
);
