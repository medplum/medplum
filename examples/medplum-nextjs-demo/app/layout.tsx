import type { Metadata } from 'next';
import Root from './root';

// eslint-disable-next-line react-refresh/only-export-components
export const metadata: Metadata = {
  title: 'Medplum Next.js Demo',
  icons: {
    icon: '/favicon.svg',
  },
};

export default function RootLayout(props: { children: React.ReactNode }): JSX.Element {
  const { children } = props;

  return (
    <html lang="en">
      <body>
        <Root>{children}</Root>
      </body>
    </html>
  );
}
