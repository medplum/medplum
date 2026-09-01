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
  const isLocal = /^(localhost|127\.0\.0\.1|0\.0\.0\.0)$|^192\.168\.|\.local(host)?$/.test(hostname);
  const isMedplumStaging =
    import.meta.env.MEDPLUM_ENVIRONMENT_FAVICON === 'true' && !/(^|\.)medplum\.com$/.test(hostname);
  if (!isLocal && !isMedplumStaging) {
    return;
  }
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
