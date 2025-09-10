// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { Button, AppShell as MantineAppShell, ScrollArea, Space, Text } from '@mantine/core';
import { useMedplumNavigate } from '@medplum/react-hooks';
import { IconPlus } from '@tabler/icons-react';
import cx from 'clsx';
import { Fragment, JSX, MouseEventHandler, ReactNode, SyntheticEvent, useState } from 'react';
import { BookmarkDialog } from '../BookmarkDialog/BookmarkDialog';
import { MedplumLink } from '../MedplumLink/MedplumLink';
import { ResourceTypeInput } from '../ResourceTypeInput/ResourceTypeInput';
import classes from './Navbar.module.css';

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
  readonly menus?: NavbarMenu[];
  readonly closeNavbar: () => void;
  readonly displayAddBookmark?: boolean;
  readonly resourceTypeSearchDisabled?: boolean;
  readonly linkStyles?: {
    readonly activeColor?: string;
    readonly strokeWidth?: number;
    readonly hoverBackgroundOnly?: boolean;
  };
}

export function Navbar(props: NavbarProps): JSX.Element {
  const navigate = useMedplumNavigate();
  const activeLink = getActiveLink(props.pathname, props.searchParams, props.menus);
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

  return (
    <>
      <MantineAppShell.Navbar>
        <ScrollArea p="xs">
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
          <MantineAppShell.Section grow>
            {props.menus?.map((menu) => (
              <Fragment key={`menu-${menu.title}`}>
                <Text size="xs" className={classes.menuTitle}>
                  {menu.title}
                </Text>
                {menu.links?.map((link) => (
                  <NavbarLink
                    key={link.href}
                    to={link.href}
                    active={link.href === activeLink?.href}
                    onClick={(e) => onLinkClick(e, link.href)}
                    linkStyles={props.linkStyles}
                  >
                    <NavLinkIcon icon={link.icon} />
                    <span>{link.label}</span>
                  </NavbarLink>
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
  readonly children: ReactNode;
  readonly linkStyles?: {
    readonly activeColor?: string;
    readonly strokeWidth?: number;
    readonly hoverBackgroundOnly?: boolean;
  };
}

function NavbarLink(props: NavbarLinkProps): JSX.Element {
  const { linkStyles } = props;

  const linkStyle = {
    ...(linkStyles?.activeColor &&
      props.active && {
        '--active-color': linkStyles.activeColor,
      }),
    ...(linkStyles?.strokeWidth && {
      '--stroke-width': `${linkStyles.strokeWidth}`,
    }),
  } as React.CSSProperties;

  return (
    <MedplumLink
      onClick={props.onClick}
      to={props.to}
      className={cx(classes.link, { [classes.linkActive]: props.active })}
      style={linkStyle}
    >
      {props.children}
    </MedplumLink>
  );
}

interface NavLinkIconProps {
  readonly icon?: JSX.Element;
}

function NavLinkIcon(props: NavLinkIconProps): JSX.Element {
  if (props.icon) {
    return props.icon;
  }
  return <Space w={30} />;
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

  // Special case for Patients (root path) - should be active for '/' and '/Patient/*' paths
  if (linkUrl.pathname === '/' && (currentPathname === '/' || currentPathname.startsWith('/Patient/'))) {
    return 1;
  }

  // Special case for Tasks - should be active for '/task' and '/Task/*' paths
  if (linkUrl.pathname === '/task' && (currentPathname === '/task' || currentPathname.startsWith('/Task/'))) {
    return 1;
  }

  // Special case for Project (admin) - should be active for '/admin/project' and '/admin/*' paths, but not '/admin/config'
  if (
    linkUrl.pathname === '/admin/project' &&
    (currentPathname === '/admin/project' ||
      (currentPathname.startsWith('/admin/') && currentPathname !== '/admin/config'))
  ) {
    return 1;
  }

  // Special case for Config (admin) - should be active for '/admin/config' only
  if (linkUrl.pathname === '/admin/config' && currentPathname === '/admin/config') {
    return 1;
  }

  // Special case for DoseSpot Favorites - should be active for '/integrations/dosespot' only
  if (linkUrl.pathname === '/integrations/dosespot' && currentPathname === '/integrations/dosespot') {
    return 2; // Higher score to ensure it takes precedence over /integrations
  }

  // For resource type links (e.g., /ServiceRequest, /Patient, /Practitioner, etc.)
  // Check if the current pathname starts with the link pathname
  // This allows sub-URLs like /ServiceRequest/new to match /ServiceRequest
  if (
    linkUrl.pathname !== '/' &&
    linkUrl.pathname !== '/task' &&
    linkUrl.pathname !== '/admin/project' &&
    linkUrl.pathname !== '/admin/config' &&
    linkUrl.pathname !== '/integrations/dosespot' &&
    currentPathname.startsWith(linkUrl.pathname)
  ) {
    // Check if the pathname segments match exactly for the resource type part
    const linkSegments = linkUrl.pathname.split('/').filter(Boolean);
    const currentSegments = currentPathname.split('/').filter(Boolean);

    // If the link is a resource type (single segment like /ServiceRequest)
    if (linkSegments.length === 1 && currentSegments.length >= 1) {
      // Check if the first segment matches (the resource type)
      if (linkSegments[0] === currentSegments[0]) {
        return 1;
      }
    }
  }

  // For other links, check exact pathname match first
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
