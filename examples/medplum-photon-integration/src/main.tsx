// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
/// <reference lib="DOM" />
import { MantineProvider, createTheme } from '@mantine/core';
import '@mantine/core/styles.css';
import { Notifications } from '@mantine/notifications';
import '@mantine/notifications/styles.css';
import { MedplumClient } from '@medplum/core';
import { MedplumProvider } from '@medplum/react';
import '@medplum/react/styles.css';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router';
import { App } from './App';

const medplum = new MedplumClient({
  onUnauthenticated: () => (window.location.href = '/'),
  baseUrl: import.meta.env.MEDPLUM_BASE_URL,
});

const theme = createTheme({
  headings: {
    sizes: {
      h1: {
        fontSize: '1.125rem',
        fontWeight: '500',
        lineHeight: '2.0',
      },
    },
  },
  fontSizes: {
    xs: '0.6875rem',
    sm: '0.875rem',
    md: '0.875rem',
    lg: '1.0rem',
    xl: '1.125rem',
  },
});

const container = document.getElementById('root') as HTMLDivElement;
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

const root = createRoot(container);
root.render(
  <StrictMode>
    <BrowserRouter>
      <MedplumProvider medplum={medplum}>
        <MantineProvider theme={theme}>
          <Notifications />
          <App />
        </MantineProvider>
      </MedplumProvider>
    </BrowserRouter>
  </StrictMode>
);
