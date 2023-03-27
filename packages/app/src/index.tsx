import { MantineProvider, MantineThemeOverride } from '@mantine/core';
import { Notifications } from '@mantine/notifications';
import { MedplumClient } from '@medplum/core';
import { MedplumProvider } from '@medplum/react';
import React from 'react';
import { createRoot } from 'react-dom/client';
import { createBrowserRouter, RouterProvider } from 'react-router-dom';
import { App } from './App';
import { Chat } from './components/Chat';
import { getConfig } from './config';

if ('serviceWorker' in navigator) {
  // Clear all server workers
  // Once upon a time, we used a service worker to cache static assets.
  // We don't do that anymore, but the old service worker is still there.
  // This code removes it.
  // Someday we can remove this code.
  window.addEventListener('load', () => {
    navigator.serviceWorker
      .getRegistrations()
      .then((regs) => Promise.all(regs.map((r) => r.unregister())))
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
          <Chat />
        </MantineProvider>
      </MedplumProvider>
    </React.StrictMode>
  );
}

if (process.env.NODE_ENV !== 'test') {
  initApp().catch(console.error);
}
