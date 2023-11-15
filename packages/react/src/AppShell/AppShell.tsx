import { AppShell as MantineAppShell } from '@mantine/core';
import { showNotification } from '@mantine/notifications';
import { useMedplum, useMedplumProfile } from '@medplum/react-hooks';
import { ReactNode, Suspense, useEffect, useState } from 'react';
import { ErrorBoundary } from '../ErrorBoundary/ErrorBoundary';
import { Loading } from '../Loading/Loading';
import classes from './AppShell.module.css';
import { Header } from './Header';
import { Navbar, NavbarMenu } from './Navbar';

export interface AppShellProps {
  logo: ReactNode;
  pathname?: string;
  searchParams?: URLSearchParams;
  headerSearchDisabled?: boolean;
  version?: string;
  menus?: NavbarMenu[];
  children: ReactNode;
  displayAddBookmark?: boolean;
  resourceTypeSearchDisabled?: boolean;
}

export function AppShell(props: AppShellProps): JSX.Element {
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
      header={{ height: 60 }}
      navbar={{
        width: 250,
        breakpoint: 'sm',
        collapsed: {
          desktop: !profile || !navbarOpen,
          mobile: !profile || !navbarOpen,
        },
      }}
      padding={0}
    >
      {profile && (
        <Header
          pathname={props.pathname}
          searchParams={props.searchParams}
          headerSearchDisabled={props.headerSearchDisabled}
          logo={props.logo}
          version={props.version}
          navbarToggle={toggleNavbar}
        />
      )}
      {profile && navbarOpen ? (
        <Navbar
          pathname={props.pathname}
          searchParams={props.searchParams}
          menus={props.menus}
          closeNavbar={closeNavbar}
          displayAddBookmark={props.displayAddBookmark}
          resourceTypeSearchDisabled={props.resourceTypeSearchDisabled}
        />
      ) : undefined}
      <MantineAppShell.Main className={classes.main}>
        <ErrorBoundary>
          <Suspense fallback={<Loading />}>{props.children}</Suspense>
        </ErrorBoundary>
      </MantineAppShell.Main>
    </MantineAppShell>
  );
}
