'use client';

import { MantineProvider } from '@mantine/core';
import '@mantine/core/styles.css';
import { MedplumClient } from '@medplum/core';
import { MedplumProvider } from '@medplum/react';
import '@medplum/react/styles.css';
import { ReactNode } from 'react';

const medplum = new MedplumClient({
  // Uncomment this to run against the server on your localhost
  // baseUrl: 'http://localhost:8103/',

  // Handle unauthenticated requests
  onUnauthenticated: () => (window.location.href = '/'),

  // Use Next.js fetch
  fetch: (url: string, options?: any) => fetch(url, options),
});

export default function Root(props: { children: ReactNode }): JSX.Element {
  return (
    <MantineProvider>
      <MedplumProvider medplum={medplum}>{props.children}</MedplumProvider>
    </MantineProvider>
  );
}
