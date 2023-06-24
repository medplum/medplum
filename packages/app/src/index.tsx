import { MantineProvider, MantineThemeOverride } from '@mantine/core';
import { Notifications } from '@mantine/notifications';
import { MedplumClient } from '@medplum/core';
import { MedplumProvider } from '@medplum/react';
import React from 'react';
import { createRoot } from 'react-dom/client';
import { createBrowserRouter, RouterProvider } from 'react-router-dom';
import { App } from './App';
import { getConfig } from './config';

if (import.meta.env?.PROD && 'serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker
      .register('/service-worker.js')
      .then((reg) => reg.update())
      .catch((regError) => console.error('SW registration failed: ', regError));
  });
}

export async function initApp(): Promise<void> {
  const config = getConfig();

  const medplum = new MedplumClient({
    baseUrl: config.baseUrl,
    clientId: config.clientId,
    cacheTime: 60000,
    autoBatchTime: 100,
    onUnauthenticated: () => {
      if (window.location.pathname !== '/signin' && window.location.pathname !== '/oauth') {
        window.location.href = '/signin?next=' + encodeURIComponent(window.location.pathname + window.location.search);
      }
    },
  });

  const theme: MantineThemeOverride = {
    headings: {
      sizes: {
        h1: {
          fontSize: '1.125rem',
          fontWeight: 500,
          lineHeight: 2.0,
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
  };

  const router = createBrowserRouter([{ path: '*', element: <App /> }]);

  const navigate = (path: string): Promise<void> => router.navigate(path);

  const root = createRoot(document.getElementById('root') as HTMLElement);
  root.render(
    <React.StrictMode>
      <MedplumProvider medplum={medplum} navigate={navigate}>
        <MantineProvider theme={theme} withGlobalStyles withNormalizeCSS>
          <Notifications position="bottom-right" />
          <RouterProvider router={router} />
        </MantineProvider>
      </MedplumProvider>
    </React.StrictMode>
  );
}

if (process.env.NODE_ENV !== 'test') {
  initApp().catch(console.error);
}
