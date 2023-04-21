import { AppShell as MantineAppShell, useMantineTheme } from '@mantine/core';
import React, { Suspense, useState } from 'react';
import { ErrorBoundary } from '../ErrorBoundary/ErrorBoundary';
import { Loading } from '../Loading/Loading';
import { useMedplum, useMedplumProfile } from '../MedplumProvider/MedplumProvider';
import { Header } from './Header';
import { Navbar, NavbarMenu } from './Navbar';

export interface AppShellProps {
  logo: React.ReactNode;
  version?: string;
  menus?: NavbarMenu[];
  children: React.ReactNode;
}

export function AppShell(props: AppShellProps): JSX.Element {
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
    <MantineAppShell
      styles={{
        main: {
          background: theme.colorScheme === 'dark' ? theme.colors.dark[8] : theme.colors.gray[0],
        },
      }}
      padding={0}
      fixed={true}
      header={profile && <Header logo={props.logo} version={props.version} navbarToggle={toggleNavbar} />}
      navbar={
        (profile && navbarOpen && <Navbar menus={props.menus} closeNavbar={closeNavbar} />) as
          | React.ReactElement
          | undefined
      }
    >
      <ErrorBoundary>
        <Suspense fallback={<Loading />}>{props.children}</Suspense>
      </ErrorBoundary>
    </MantineAppShell>
  );
}
