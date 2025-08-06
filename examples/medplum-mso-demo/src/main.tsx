// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { createTheme, MantineProvider } from '@mantine/core';
import '@mantine/core/styles.css';
import { Notifications } from '@mantine/notifications';
import { MedplumClient } from '@medplum/core';
import { MedplumProvider } from '@medplum/react';
import '@medplum/react/styles.css';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { createBrowserRouter, RouterProvider } from 'react-router';
import { App } from './App';
import { getConfig } from './config';

const medplum = new MedplumClient({
  onUnauthenticated: () => (window.location.href = '/'),
  baseUrl: getConfig().baseUrl,
  fhirUrlPath: 'fhir/R4',
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
const root = createRoot(container);
const router = createBrowserRouter([{ path: '*', element: <App /> }]);
root.render(
  <StrictMode>
    <MedplumProvider medplum={medplum}>
      <MantineProvider theme={theme}>
        <Notifications position="bottom-right" limit={5} />
        <RouterProvider router={router} />
      </MantineProvider>
    </MedplumProvider>
  </StrictMode>
);
