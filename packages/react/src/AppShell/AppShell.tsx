import { AppShell as MantineAppShell, useMantineTheme } from '@mantine/core';
import { showNotification } from '@mantine/notifications';
import { useMedplum, useMedplumProfile } from '@medplum/react-hooks';
import React, { Suspense, useEffect, useState } from 'react';
import { ErrorBoundary } from '../ErrorBoundary/ErrorBoundary';
import { Loading } from '../Loading/Loading';
import { Header } from './Header';
import { Navbar, NavbarMenu } from './Navbar';

export interface AppShellProps {
  logo: React.ReactNode;
  pathname?: string;
  searchParams?: URLSearchParams;
  headerSearchDisabled?: boolean;
  version?: string;
  menus?: NavbarMenu[];
  children: React.ReactNode;
  displayAddBookmark?: boolean;
  resourceTypeSearchDisabled?: boolean;
}

export function AppShell(props: AppShellProps): JSX.Element {
  const theme = useMantineTheme();
  const [navbarOpen, setNavbarOpen] = useState(localStorage['navbarOpen'] === 'true');
  const medplum = useMedplum();
  const profile = useMedplumProfile();

  useEffect(() => {
    function eventListener(): void {
      showNotification({ color: 'red', message: 'No connection to server', autoClose: false });
    }
    medplum.addEventListener('offline', eventListener);
    return () => medplum.removeEventListener('offline', eventListener);
  }, [medplum]);

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
    <MantineAppShell
      styles={{
        main: {
          background: theme.colorScheme === 'dark' ? theme.colors.dark[8] : theme.colors.gray[0],
        },
      }}
      padding={0}
      fixed={true}
      header={
        profile && (
          <Header
            pathname={props.pathname}
            searchParams={props.searchParams}
            headerSearchDisabled={props.headerSearchDisabled}
            logo={props.logo}
            version={props.version}
            navbarToggle={toggleNavbar}
          />
        )
      }
      navbar={
        profile && navbarOpen ? (
          <Navbar
            pathname={props.pathname}
            searchParams={props.searchParams}
            menus={props.menus}
            closeNavbar={closeNavbar}
            displayAddBookmark={props.displayAddBookmark}
            resourceTypeSearchDisabled={props.resourceTypeSearchDisabled}
          />
        ) : undefined
      }
    >
      <ErrorBoundary key={`${props.pathname}?${props.searchParams?.toString()}`}>
        <Suspense fallback={<Loading />}>{props.children}</Suspense>
      </ErrorBoundary>
    </MantineAppShell>
  );
}
