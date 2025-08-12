// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { createTheme, MantineProvider } from '@mantine/core';
import '@mantine/core/styles.css';
import { Notifications } from '@mantine/notifications';
import '@mantine/notifications/styles.css';
import { MedplumClient } from '@medplum/core';
import { MedplumProvider } from '@medplum/react';
import '@medplum/react/styles.css';
import { createRoot } from 'react-dom/client';
import { createBrowserRouter, RouterProvider } from 'react-router';
import { App } from './App';
import { getConfig } from './config';

const medplum = new MedplumClient({
  baseUrl: getConfig().baseUrl,
  cacheTime: 60000,
  autoBatchTime: 100,
  onUnauthenticated: () => {
    if (window.location.pathname !== '/signin' && window.location.pathname !== '/oauth') {
      let next = window.location.pathname + window.location.search;
      next = next === '/' ? '' : '?next=' + encodeURIComponent(next);
      window.location.href = '/signin' + next;
    }
  },
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

const router = createBrowserRouter([{ path: '*', element: <App /> }]);
const navigate = (path: string): Promise<void> => router.navigate(path);

const root = createRoot(document.getElementById('root') as HTMLElement);
root.render(
  <MantineProvider theme={theme}>
    <MedplumProvider medplum={medplum} navigate={navigate}>
      <Notifications position="bottom-right" />
      <RouterProvider router={router} />
    </MedplumProvider>
  </MantineProvider>
);
