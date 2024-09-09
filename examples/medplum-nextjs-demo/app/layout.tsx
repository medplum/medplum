import { ColorSchemeScript, MantineProvider } from '@mantine/core';
import type { Metadata } from 'next';
import { ReactNode } from 'react';
import Root from './root';
import { theme } from './theme';

// eslint-disable-next-line react-refresh/only-export-components
export const metadata: Metadata = {
  title: 'Medplum Next.js Demo',
  icons: {
    icon: '/favicon.svg',
  },
};

export default function RootLayout(props: { children: ReactNode }): JSX.Element {
  const { children } = props;

  return (
    <html lang="en">
      <head>
        <ColorSchemeScript />
        <link rel="shortcut icon" href="/favicon.svg" />
        <meta name="viewport" content="minimum-scale=1, initial-scale=1, width=device-width, user-scalable=no" />
      </head>
      <body>
        <MantineProvider theme={theme}>
          <Root>{children}</Root>
        </MantineProvider>
      </body>
    </html>
  );
}
