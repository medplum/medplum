// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import type { AppShellHeaderConfiguration, AppShellNavbarConfiguration } from '@mantine/core';
import { AppShell as MantineAppShell } from '@mantine/core';
import { useMedplum, useMedplumProfile } from '@medplum/react-hooks';
import type { JSX, ReactNode } from 'react';
import { Suspense, useState } from 'react';
import { ErrorBoundary } from '../ErrorBoundary/ErrorBoundary';
import { Loading } from '../Loading/Loading';
import type { AppShellAnnouncement } from './AnnouncementBanners';
import { AnnouncementBanners } from './AnnouncementBanners';
import classes from './AppShell.module.css';
import { Header } from './Header';
import type { NavbarMenu } from './Navbar';
import { Navbar } from './Navbar';

const OPEN_WIDTH = 250;
const CLOSED_WIDTH = 59;
const HEADER_HEIGHT = 60;
const ANNOUNCEMENT_HEIGHT = 36;

export type { AppShellAnnouncement } from './AnnouncementBanners';

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
  readonly announcements?: AppShellAnnouncement[];
  readonly layoutVersion?: 'v1' | 'v2';
  readonly showLayoutVersionToggle?: boolean;
  readonly spotlightPatientsOnly?: boolean;
}

export function AppShell(props: AppShellProps): JSX.Element {
  const [navbarOpen, setNavbarOpen] = useState(localStorage['navbarOpen'] === 'true');
  const [layoutVersion] = useState(
    props.layoutVersion ?? (localStorage['appShellLayoutVersion'] as 'v1' | 'v2' | undefined) ?? 'v1'
  );
  const medplum = useMedplum();
  const profile = useMedplumProfile();
  const [dismissedAnnouncementIds, setDismissedAnnouncementIds] = useState<ReadonlySet<string>>(() => {
    try {
      const dismissed = localStorage['appShellDismissedAnnouncements'];
      return new Set(dismissed ? JSON.parse(dismissed) : []);
    } catch (_err) {
      return new Set();
    }
  });

  const visibleAnnouncements = props.announcements?.filter(
    (announcement) => !announcement.id || !dismissedAnnouncementIds.has(announcement.id)
  );
  const announcementHeight = visibleAnnouncements?.length ? visibleAnnouncements.length * ANNOUNCEMENT_HEIGHT : 0;

  function setNavbarOpenWrapper(open: boolean): void {
    localStorage['navbarOpen'] = open.toString();
    setNavbarOpen(open);
  }

  function dismissAnnouncement(announcement: AppShellAnnouncement): void {
    if (announcement.id) {
      setDismissedAnnouncementIds((dismissedIds) => {
        const updated = new Set(dismissedIds);
        updated.add(announcement.id as string);
        localStorage['appShellDismissedAnnouncements'] = JSON.stringify([...updated]);
        return updated;
      });
    }
    announcement.onDismiss?.(announcement);
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
    headerProp = { height: announcementHeight };
    navbarProp = {
      width: navbarOpen ? OPEN_WIDTH : CLOSED_WIDTH,
      breakpoint: 0,
      collapsed: {
        desktop: !profile,
        mobile: !profile,
      },
    };
    headerComponent = visibleAnnouncements?.length ? (
      <MantineAppShell.Header style={{ zIndex: 101 }}>
        <AnnouncementBanners announcements={visibleAnnouncements} onDismiss={dismissAnnouncement} />
      </MantineAppShell.Header>
    ) : undefined;
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
        patientsOnly={props.spotlightPatientsOnly}
        userMenuEnabled={true}
        version={props.version}
        showLayoutVersionToggle={props.showLayoutVersionToggle}
      />
    ) : undefined;
  } else {
    // Default to layout version v1
    headerProp = { height: HEADER_HEIGHT + announcementHeight };
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
        announcements={visibleAnnouncements}
        onDismissAnnouncement={dismissAnnouncement}
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
          patientsOnly={props.spotlightPatientsOnly}
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
