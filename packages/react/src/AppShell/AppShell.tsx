// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import type { AppShellHeaderConfiguration, AppShellNavbarConfiguration } from '@mantine/core';
import { AppShell as MantineAppShell } from '@mantine/core';
import { useMedplum, useMedplumProfile } from '@medplum/react-hooks';
import type { JSX, ReactNode } from 'react';
import { Suspense, useState } from 'react';
import { ErrorBoundary } from '../ErrorBoundary/ErrorBoundary';
import { Loading } from '../Loading/Loading';
import classes from './AppShell.module.css';
import { Header } from './Header';
import type { NavbarMenu } from './Navbar';
import { Navbar } from './Navbar';

const OPEN_WIDTH = 250;
const CLOSED_WIDTH = 70;

export interface AppShellProps {
  readonly logo: ReactNode;
  readonly pathname?: string;
  readonly searchParams?: URLSearchParams;
  readonly headerSearchDisabled?: boolean;
  readonly version?: string;
  readonly menus?: NavbarMenu[];
  readonly children: ReactNode;
  readonly displayAddBookmark?: boolean;
  readonly resourceTypeSearchDisabled?: boolean;
  readonly notifications?: ReactNode;
  readonly layoutVersion?: 'v1' | 'v2';
}

export function AppShell(props: AppShellProps): JSX.Element {
  const [navbarOpen, setNavbarOpen] = useState(localStorage['navbarOpen'] === 'true');
  const [layoutVersion] = useState(
    props.layoutVersion ?? (localStorage['appShellLayoutVersion'] as 'v1' | 'v2' | undefined) ?? 'v1'
  );
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

  let headerProp: AppShellHeaderConfiguration | undefined;
  let navbarProp: AppShellNavbarConfiguration | undefined;
  let headerComponent: ReactNode | undefined;
  let navbarComponent: ReactNode | undefined;

  if (layoutVersion === 'v2') {
    // Layout version v2:
    // - No header
    // - Navbar is either open or closed based on state
    headerProp = { height: 0 };
    navbarProp = {
      width: navbarOpen ? OPEN_WIDTH : CLOSED_WIDTH,
      breakpoint: 0,
      collapsed: {
        desktop: !profile,
        mobile: !profile,
      },
    };
    headerComponent = undefined;
    navbarComponent = profile ? (
      <Navbar
        logo={props.logo}
        pathname={props.pathname}
        searchParams={props.searchParams}
        menus={props.menus}
        navbarToggle={toggleNavbar}
        closeNavbar={closeNavbar}
        displayAddBookmark={props.displayAddBookmark}
        resourceTypeSearchDisabled={true}
        opened={navbarOpen}
        spotlightEnabled={true}
        userMenuEnabled={true}
        version={props.version}
      />
    ) : undefined;
  } else {
    // Default to layout version v1
    headerProp = { height: 60 };
    navbarProp = {
      width: OPEN_WIDTH,
      breakpoint: 'sm',
      collapsed: {
        desktop: !profile || !navbarOpen,
        mobile: !profile || !navbarOpen,
      },
    };
    headerComponent = profile && (
      <Header
        pathname={props.pathname}
        searchParams={props.searchParams}
        headerSearchDisabled={props.headerSearchDisabled}
        logo={props.logo}
        version={props.version}
        navbarOpen={navbarOpen}
        navbarToggle={toggleNavbar}
        notifications={props.notifications}
      />
    );
    navbarComponent =
      profile && navbarOpen ? (
        <Navbar
          pathname={props.pathname}
          searchParams={props.searchParams}
          menus={props.menus}
          navbarToggle={toggleNavbar}
          closeNavbar={closeNavbar}
          displayAddBookmark={props.displayAddBookmark}
          resourceTypeSearchDisabled={props.resourceTypeSearchDisabled}
        />
      ) : undefined;
  }

  return (
    <MantineAppShell header={headerProp} navbar={navbarProp} padding={0}>
      {headerComponent}
      {navbarComponent}
      <MantineAppShell.Main className={classes.main}>
        <ErrorBoundary>
          <Suspense fallback={<Loading />}>{props.children}</Suspense>
        </ErrorBoundary>
      </MantineAppShell.Main>
    </MantineAppShell>
  );
}
