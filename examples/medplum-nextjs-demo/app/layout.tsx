'use client';

import { MantineProvider } from '@mantine/core';
import { MedplumClient } from '@medplum/core';
import { MedplumProvider } from '@medplum/react';

const medplum = new MedplumClient({
  // Uncomment this to run against the server on your localhost
  // baseUrl: 'http://localhost:8103/',

  // Handle unauthenticated requests
  onUnauthenticated: () => (window.location.href = '/'),

  // Use Next.js fetch
  fetch: (url: string, options?: any) => fetch(url, options),
});

export default function RootLayout(props: { children: React.ReactNode }): JSX.Element {
  const { children } = props;

  return (
    <html lang="en">
      <body>
        <MantineProvider withGlobalStyles withNormalizeCSS>
          <MedplumProvider medplum={medplum}>{children}</MedplumProvider>
        </MantineProvider>
      </body>
    </html>
  );
}
