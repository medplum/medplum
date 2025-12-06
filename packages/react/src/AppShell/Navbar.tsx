// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import {
  Button,
  AppShell as MantineAppShell,
  Menu,
  ScrollArea,
  Space,
  Text,
  Tooltip,
  UnstyledButton,
} from '@mantine/core';
import { spotlight } from '@mantine/spotlight';
import { formatHumanName } from '@medplum/core';
import type { HumanName } from '@medplum/fhirtypes';
import { useMedplumNavigate, useMedplumProfile } from '@medplum/react-hooks';
import { IconLayoutSidebar, IconPlus, IconSearch } from '@tabler/icons-react';
import type { JSX, MouseEventHandler, ReactNode, SyntheticEvent } from 'react';
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
  readonly userMenuEnabled?: boolean;
  readonly displayAddBookmark?: boolean;
  readonly resourceTypeSearchDisabled?: boolean;
  readonly opened?: boolean;
  readonly version?: string;
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
          <MantineAppShell.Section px="sm" py="xs">
            <UnstyledButton
              className={classes.logoButton}
              onClick={props.navbarToggle}
              aria-expanded={opened}
              aria-controls="navbar"
            >
              {props.logo}
            </UnstyledButton>
          </MantineAppShell.Section>
        )}
        <ScrollArea px="sm" py="xs" h="100%">
          <MantineAppShell.Section grow>
            {props.spotlightEnabled && (
              <NavbarLink
                to="#"
                active={false}
                onClick={spotlight.open}
                icon={<IconSearch size="1.2rem" />}
                label="Search"
                opened={opened}
              />
            )}
            {props.spotlightEnabled && <Spotlight />}
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
            {props.menus?.map((menu) => (
              <Fragment key={`menu-${menu.title}`}>
                {opened ? <Text className={classes.menuTitle}>{menu.title}</Text> : <Space h={41} />}
                {menu.links?.map((link) => (
                  <NavbarLink
                    key={link.href}
                    to={link.href}
                    active={link.href === activeLink?.href}
                    onClick={(e) => onLinkClick(e, link.href)}
                    icon={link.icon}
                    label={link.label ?? ''}
                    opened={opened}
                  />
                ))}
              </Fragment>
            ))}
            {props.displayAddBookmark && (
              <Button
                variant="subtle"
                size="xs"
                mt="xl"
                leftSection={<IconPlus size="0.75rem" />}
                onClick={() => setBookmarkDialogVisible(true)}
              >
                Add Bookmark
              </Button>
            )}
          </MantineAppShell.Section>
        </ScrollArea>
        {props.userMenuEnabled && (
          <MantineAppShell.Section px="sm" py="xs">
            <Tooltip label="Toggle navbar" position="right" transitionProps={{ duration: 0 }}>
              <UnstyledButton
                className={classes.toggleButton}
                aria-label="Toggle navbar"
                onClick={props.navbarToggle}
                aria-expanded={opened}
                aria-controls="navbar"
              >
                <IconLayoutSidebar />
              </UnstyledButton>
            </Tooltip>
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
                  aria-label="User menu"
                  data-active={userMenuOpened || undefined}
                  onClick={() => setUserMenuOpened((o) => !o)}
                >
                  <ResourceAvatar value={profile} radius="xl" size={18} />
                  {opened && <span>{formatHumanName(profile?.name?.[0] as HumanName)}</span>}
                </UnstyledButton>
              </Menu.Target>
              <Menu.Dropdown>
                <HeaderDropdown version={props.version} />
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

interface NavbarLinkProps {
  readonly to: string;
  readonly active: boolean;
  readonly onClick: MouseEventHandler;
  readonly icon?: JSX.Element;
  readonly label: string;
  readonly opened?: boolean;
}

function NavbarLink(props: NavbarLinkProps): JSX.Element {
  const { to, icon, label, onClick, active } = props;

  // If the navbar is opened, show the labels, but no tooltips
  if (props.opened) {
    return (
      <MedplumLink to={to} onClick={onClick} className={classes.link} data-active={active || undefined}>
        {icon}
        <span>{label}</span>
      </MedplumLink>
    );
  }

  // Otherwise, if the navbar is closed, show tooltips, but no labels
  return (
    <Tooltip label={label} position="right" transitionProps={{ duration: 0 }}>
      <MedplumLink to={to} onClick={onClick} className={classes.link} data-active={active || undefined}>
        {icon}
      </MedplumLink>
    </Tooltip>
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
