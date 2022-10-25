import { AppShell, useMantineTheme } from '@mantine/core';
import { useDisclosure } from '@mantine/hooks';
import { ErrorBoundary, useMedplum, useMedplumProfile } from '@medplum/react';
import React, { Suspense } from 'react';
import { AppHeader } from './AppHeader';
import { AppNavbar } from './AppNavbar';
import { AppRoutes } from './AppRoutes';
import { Loading } from './components/Loading';

import './App.css';

export function App(): JSX.Element {
  const theme = useMantineTheme();
  const [navbarOpen, { toggle, close }] = useDisclosure(false);
  const medplum = useMedplum();
  const profile = useMedplumProfile();

  if (medplum.isLoading()) {
    return <Loading />;
  }

  return (
    <AppShell
      styles={{
        main: {
          background: theme.colorScheme === 'dark' ? theme.colors.dark[8] : theme.colors.gray[0],
        },
      }}
      padding={0}
      fixed={true}
      navbar={(profile && navbarOpen && <AppNavbar closeNavbar={close} />) as React.ReactElement | undefined}
      header={profile && <AppHeader navbarToggle={toggle} />}
    >
      <ErrorBoundary>
        <Suspense fallback={<Loading />}>
          <AppRoutes />
        </Suspense>
      </ErrorBoundary>
    </AppShell>
  );
}
