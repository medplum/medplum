'use client';

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

  // Recommend using cache for React performance
  cacheTime: 10000,
});

export default function Root(props: { children: ReactNode }): JSX.Element {
  return <MedplumProvider medplum={medplum}>{props.children}</MedplumProvider>;
}
