// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import {
  Box,
  Divider,
  AppShell as MantineAppShell,
  Menu,
  ScrollArea,
  Stack,
  Text,
  Tooltip,
  UnstyledButton,
} from '@mantine/core';
import { spotlight } from '@mantine/spotlight';
import { formatHumanName } from '@medplum/core';
import type { HumanName, ResourceType } from '@medplum/fhirtypes';
import { useMedplumNavigate, useMedplumProfile, useNotificationCount } from '@medplum/react-hooks';
import { IconBookmark, IconCirclePlus, IconLayoutSidebar, IconSearch, IconX } from '@tabler/icons-react';
import type { JSX, MouseEvent, MouseEventHandler, ReactNode, SyntheticEvent } from 'react';
import { Fragment, useState } from 'react';
import { BookmarkDialog } from '../BookmarkDialog/BookmarkDialog';
import { MedplumLink } from '../MedplumLink/MedplumLink';
import { ResourceAvatar } from '../ResourceAvatar/ResourceAvatar';
import { ResourceTypeInput } from '../ResourceTypeInput/ResourceTypeInput';
import { HeaderDropdown } from './HeaderDropdown';
import classes from './Navbar.module.css';
import { Spotlight } from './Spotlight';

export interface NavbarLink {
  readonly icon?: JSX.Element;
  readonly label?: string;
  readonly href: string;
  /** Static count to display. Ignored if notificationCount is provided. */
  readonly count?: number;
  /** If true, shows red alert styling (red dot on collapsed icon, red count text when expanded). */
  readonly alert?: boolean;
  /** Live subscription-based count. Overrides static `count` when provided. */
  readonly notificationCount?: {
    readonly resourceType: ResourceType;
    readonly countCriteria: string;
    readonly subscriptionCriteria: string;
  };
  /** Callback fired when the dismiss button is clicked. When provided, a dismiss (X) button appears on hover. */
  readonly onDismiss?: () => void;
}

export interface NavbarMenu {
  readonly title?: string;
  readonly links?: NavbarLink[];
}

export interface NavbarProps {
  readonly pathname?: string;
  readonly searchParams?: URLSearchParams;
  readonly logo?: ReactNode;
  readonly menus?: NavbarMenu[];
  readonly navbarToggle: () => void;
  readonly closeNavbar: () => void;
  readonly spotlightEnabled?: boolean;
  readonly patientsOnly?: boolean;
  readonly userMenuEnabled?: boolean;
  readonly displayAddBookmark?: boolean;
  readonly resourceTypeSearchDisabled?: boolean;
  readonly opened?: boolean;
  readonly version?: string;
  readonly showLayoutVersionToggle?: boolean;
}

export function Navbar(props: NavbarProps): JSX.Element {
  const navigate = useMedplumNavigate();
  const profile = useMedplumProfile();
  const activeLink = getActiveLink(props.pathname, props.searchParams, props.menus);
  const [userMenuOpened, setUserMenuOpened] = useState(false);
  const [bookmarkDialogVisible, setBookmarkDialogVisible] = useState(false);

  function onLinkClick(e: SyntheticEvent, to: string): void {
    e.stopPropagation();
    e.preventDefault();
    navigate(to);
    if (window.innerWidth < 768) {
      props.closeNavbar();
    }
  }

  function navigateResourceType(resourceType: string | undefined): void {
    if (resourceType) {
      navigate(`/${resourceType}`);
    }
  }

  const opened = props.opened ?? true;

  return (
    <>
      <MantineAppShell.Navbar id="navbar" className={classes.navbar}>
        {props.logo && (
          <MantineAppShell.Section px="xs" pt="xs" pb="4px">
            <UnstyledButton
              className={classes.logoButton}
              onClick={props.navbarToggle}
              aria-expanded={opened}
              aria-controls="navbar"
              aria-label="Medplum Logo"
            >
              {props.logo}
            </UnstyledButton>
          </MantineAppShell.Section>
        )}
        <ScrollArea px="xs" pb="xs" pt="sm" h="100%">
          <MantineAppShell.Section grow>
            {props.spotlightEnabled && (
              <Box mb={2}>
                <Tooltip label="Search" position="right" transitionProps={{ duration: 0 }} disabled={opened}>
                  <UnstyledButton className={classes.link} onClick={() => spotlight.open()} aria-label="Search">
                    <IconSearch size="1.2rem" />
                    <span className={classes.linkLabel} data-opened={opened || undefined}>
                      Search
                    </span>
                  </UnstyledButton>
                </Tooltip>
              </Box>
            )}
            {props.spotlightEnabled && <Spotlight patientsOnly={props.patientsOnly} />}
            {!props.resourceTypeSearchDisabled && (
              <MantineAppShell.Section mb="sm">
                <ResourceTypeInput
                  key={window.location.pathname}
                  name="resourceType"
                  placeholder="Resource Type"
                  maxValues={0}
                  onChange={(newValue) => navigateResourceType(newValue)}
                />
              </MantineAppShell.Section>
            )}
            {props.menus?.map((menu, index) => (
              <Fragment key={`menu-${menu.title ?? index}`}>
                {menu.title && (
                  <Text className={classes.menuTitle} data-opened={opened || undefined}>
                    {menu.title}
                  </Text>
                )}
                <Stack gap="2">
                  {menu.links?.map((link) =>
                    link.notificationCount ? (
                      <NavbarLinkWithSubscription
                        key={link.href}
                        to={link.href}
                        active={link.href === activeLink?.href}
                        onClick={(e) => onLinkClick(e, link.href)}
                        icon={link.icon}
                        label={link.label ?? ''}
                        opened={opened}
                        alert={link.alert}
                        notificationCount={link.notificationCount}
                        onDismiss={link.onDismiss}
                      />
                    ) : (
                      <NavbarLinkContent
                        key={link.href}
                        to={link.href}
                        active={link.href === activeLink?.href}
                        onClick={(e) => onLinkClick(e, link.href)}
                        icon={link.icon}
                        label={link.label ?? ''}
                        opened={opened}
                        alert={link.alert}
                        count={link.count}
                        onDismiss={link.onDismiss}
                      />
                    )
                  )}
                </Stack>
              </Fragment>
            ))}
            {props.displayAddBookmark && (
              <Tooltip label="Add Bookmark" position="right" transitionProps={{ duration: 0 }} disabled={opened}>
                <UnstyledButton
                  className={`${classes.link} ${classes.addBookmarkLink}`}
                  onClick={() => setBookmarkDialogVisible(true)}
                >
                  <IconCirclePlus />
                  <span className={classes.linkLabel} data-opened={opened || undefined}>
                    Add Bookmark
                  </span>
                </UnstyledButton>
              </Tooltip>
            )}
          </MantineAppShell.Section>
        </ScrollArea>
        {props.userMenuEnabled && (
          <MantineAppShell.Section px="xs" py="xs">
            <Tooltip
              label={opened ? 'Close Sidebar' : 'Open Sidebar'}
              position="right"
              transitionProps={{ duration: 0 }}
            >
              <UnstyledButton
                className={classes.toggleButton}
                aria-label={opened ? 'Close Sidebar' : 'Open Sidebar'}
                onClick={props.navbarToggle}
                aria-expanded={opened}
                aria-controls="navbar"
              >
                <IconLayoutSidebar />
              </UnstyledButton>
            </Tooltip>
            <Divider my="xs" mx={6} className={classes.divider} />
            <Menu
              width={260}
              shadow="xl"
              position="top-start"
              transitionProps={{ transition: 'fade-up' }}
              opened={userMenuOpened}
              onClose={() => setUserMenuOpened(false)}
            >
              <Menu.Target>
                <UnstyledButton
                  className={classes.link}
                  pl="7"
                  aria-label="User menu"
                  data-active={userMenuOpened || undefined}
                  onClick={() => setUserMenuOpened((o) => !o)}
                  bd="1px 0 0 0 solid var(--mantine-color-gray-200)"
                >
                  <ResourceAvatar value={profile} radius="xl" size={24} />
                  <span className={classes.linkLabel} data-opened={opened || undefined}>
                    {formatHumanName(profile?.name?.[0] as HumanName)}
                  </span>
                </UnstyledButton>
              </Menu.Target>
              <Menu.Dropdown>
                <HeaderDropdown version={props.version} showLayoutVersionToggle={props.showLayoutVersionToggle} />
              </Menu.Dropdown>
            </Menu>
          </MantineAppShell.Section>
        )}
      </MantineAppShell.Navbar>
      {props.pathname && props.searchParams && (
        <BookmarkDialog
          pathname={props.pathname}
          searchParams={props.searchParams}
          visible={bookmarkDialogVisible}
          onOk={() => setBookmarkDialogVisible(false)}
          onCancel={() => setBookmarkDialogVisible(false)}
        />
      )}
    </>
  );
}

interface NavbarLinkContentProps {
  readonly to: string;
  readonly active: boolean;
  readonly onClick: MouseEventHandler;
  readonly icon?: JSX.Element;
  readonly label: string;
  readonly opened?: boolean;
  readonly count?: number;
  readonly alert?: boolean;
  readonly onDismiss?: () => void;
}

function NavbarLinkContent(props: NavbarLinkContentProps): JSX.Element {
  const { to, icon, label, onClick, active, count, alert, opened, onDismiss } = props;
  const showCount = count !== undefined && count > 0;

  const iconElement = icon ?? <IconBookmark />;
  const showDot = showCount && alert && !opened;

  function handleDismiss(e: MouseEvent): void {
    e.preventDefault();
    e.stopPropagation();
    onDismiss?.();
  }

  return (
    <Tooltip label={label} position="right" transitionProps={{ duration: 0 }} disabled={opened}>
      <MedplumLink to={to} onClick={onClick} className={classes.link} data-active={active || undefined}>
        <span className={classes.iconWrapper}>
          {iconElement}
          {showDot && <span className={classes.alertDot} />}
        </span>
        <span className={classes.linkLabel} data-opened={opened || undefined}>
          {label}
        </span>
        {showCount && (
          <span className={classes.linkCount} data-opened={opened || undefined} data-alert={alert || undefined}>
            {count.toLocaleString()}
          </span>
        )}
        {onDismiss && opened && (
          <Tooltip label="Dismiss" openDelay={500}>
            <UnstyledButton aria-label="Dismiss" className={classes.dismissButton} onClick={handleDismiss}>
              <IconX size={14} />
            </UnstyledButton>
          </Tooltip>
        )}
      </MedplumLink>
    </Tooltip>
  );
}

interface NavbarLinkWithSubscriptionProps {
  readonly to: string;
  readonly active: boolean;
  readonly onClick: MouseEventHandler;
  readonly icon?: JSX.Element;
  readonly label: string;
  readonly opened?: boolean;
  readonly alert?: boolean;
  readonly notificationCount: {
    readonly resourceType: ResourceType;
    readonly countCriteria: string;
    readonly subscriptionCriteria: string;
  };
  readonly onDismiss?: () => void;
}

function NavbarLinkWithSubscription(props: NavbarLinkWithSubscriptionProps): JSX.Element {
  const count = useNotificationCount(props.notificationCount);
  return (
    <NavbarLinkContent
      to={props.to}
      active={props.active}
      onClick={props.onClick}
      icon={props.icon}
      label={props.label}
      opened={props.opened}
      alert={props.alert}
      count={count}
      onDismiss={props.onDismiss}
    />
  );
}

/**
 * Returns the best "active" link for the menu.
 * In most cases, the navbar links are simple, and an exact match can determine which link is active.
 * However, we ignore some search parameters to support pagination.
 * But we cannot ignore all search parameters, to support separate links based on search filters.
 * So in the end, we use a simple scoring system based on the number of matching query search params.
 * @param currentPathname - The web browser current pathname.
 * @param currentSearchParams - The web browser current search parameters.
 * @param menus - Collection of navbar menus and links.
 * @returns The active link if one is found.
 */
function getActiveLink(
  currentPathname: string | undefined,
  currentSearchParams: URLSearchParams | undefined,
  menus: NavbarMenu[] | undefined
): NavbarLink | undefined {
  if (!currentPathname || !currentSearchParams || !menus) {
    return undefined;
  }

  let bestLink = undefined;
  let bestScore = 0;

  for (const menu of menus) {
    if (menu.links) {
      for (const link of menu.links) {
        const score = getLinkScore(currentPathname, currentSearchParams, link.href);
        if (score > bestScore) {
          bestScore = score;
          bestLink = link;
        }
      }
    }
  }

  return bestLink;
}

/**
 * Calculates a score for a link.
 * Zero means "does not match at all".
 * One means "matches the pathname only".
 * Additional increases for each matching search parameter.
 * Ignores pagination parameters "_count" and "_offset".
 * @param currentPathname - The web browser current pathname.
 * @param currentSearchParams - The web browser current search parameters.
 * @param linkHref - A candidate link href.
 * @returns The link score.
 */
function getLinkScore(currentPathname: string, currentSearchParams: URLSearchParams, linkHref: string): number {
  const linkUrl = new URL(linkHref, 'https://example.com');
  if (currentPathname !== linkUrl.pathname) {
    return 0;
  }
  const ignoredParams = ['_count', '_offset'];
  for (const [key, value] of linkUrl.searchParams.entries()) {
    if (ignoredParams.includes(key)) {
      continue;
    }
    if (currentSearchParams.get(key) !== value) {
      return 0;
    }
  }
  let count = 1;
  for (const [key, value] of currentSearchParams.entries()) {
    if (ignoredParams.includes(key)) {
      continue;
    }
    if (linkUrl.searchParams.get(key) === value) {
      count++;
    }
  }
  return count;
}
