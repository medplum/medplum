import { AppShell, useMantineTheme } from '@mantine/core';
import { ErrorBoundary, useMedplum, useMedplumProfile } from '@medplum/react';
import React, { Suspense, useState } from 'react';
import { AppHeader } from './AppHeader';
import { AppNavbar } from './AppNavbar';
import { AppRoutes } from './AppRoutes';
import { Loading } from './components/Loading';

import './App.css';

export function App(): JSX.Element {
  const theme = useMantineTheme();
  const [navbarOpen, setNavbarOpen] = useState(localStorage['navbarOpen'] === 'true');
  const medplum = useMedplum();
  const profile = useMedplumProfile();

  function setNavbarOpenWrapper(open: boolean): void {
    localStorage['navbarOpen'] = open.toString();
    setNavbarOpen(open);
  }

  function closeNavbar(): void {
    setNavbarOpenWrapper(false);
  }

  function toggleNavbar(): void {
    setNavbarOpenWrapper(!navbarOpen);
  }

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
      navbar={(profile && navbarOpen && <AppNavbar closeNavbar={closeNavbar} />) as React.ReactElement | undefined}
      header={profile && <AppHeader navbarToggle={toggleNavbar} />}
    >
      <ErrorBoundary>
        <Suspense fallback={<Loading />}>
          <AppRoutes />
        </Suspense>
      </ErrorBoundary>
    </AppShell>
  );
}
