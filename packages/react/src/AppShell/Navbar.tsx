import { Button, createStyles, Navbar as MantineNavbar, ScrollArea, Space, Text } from '@mantine/core';
import { IconPlus } from '@tabler/icons-react';
import React, { useState } from 'react';
import { BookmarkDialog } from '../BookmarkDialog/BookmarkDialog';
import { CodeInput } from '../CodeInput/CodeInput';
import { MedplumLink } from '../MedplumLink/MedplumLink';
import { useMedplumNavigate } from '../MedplumProvider/MedplumProvider';

const useStyles = createStyles((theme) => {
  return {
    menuTitle: {
      margin: '20px 0 4px 6px',
      fontSize: '9px',
      fontWeight: 'normal',
      textTransform: 'uppercase',
      letterSpacing: '2px',
    },

    link: {
      ...theme.fn.focusStyles(),
      display: 'flex',
      alignItems: 'center',
      textDecoration: 'none',
      fontSize: theme.fontSizes.sm,
      color: theme.colorScheme === 'dark' ? theme.colors.dark[1] : theme.colors.gray[7],
      padding: `8px 12px`,
      borderRadius: theme.radius.sm,
      fontWeight: 500,

      '&:hover': {
        backgroundColor: theme.colorScheme === 'dark' ? theme.colors.dark[6] : theme.colors.gray[0],
        color: theme.colorScheme === 'dark' ? theme.white : theme.black,
        textDecoration: 'none',

        [`& svg`]: {
          color: theme.colorScheme === 'dark' ? theme.white : theme.black,
        },
      },

      '& svg': {
        color: theme.colorScheme === 'dark' ? theme.colors.dark[2] : theme.colors.gray[6],
        marginRight: theme.spacing.sm,
        strokeWidth: 1.5,
        width: 18,
        height: 18,
      },
    },

    linkActive: {
      '&, &:hover': {
        backgroundColor: theme.fn.variant({ variant: 'light', color: theme.primaryColor }).background,
        color: theme.fn.variant({ variant: 'light', color: theme.primaryColor }).color,
        [`& svg`]: {
          color: theme.fn.variant({ variant: 'light', color: theme.primaryColor }).color,
        },
      },
    },
  };
});

export interface NavbarLink {
  icon?: JSX.Element;
  label?: string;
  href: string;
}

export interface NavbarMenu {
  title?: string;
  links?: NavbarLink[];
}

export interface NavbarProps {
  pathname?: string;
  searchParams?: URLSearchParams;
  menus?: NavbarMenu[];
  closeNavbar: () => void;
  displayAddBookmark?: boolean;
}

export function Navbar(props: NavbarProps): JSX.Element {
  const { classes } = useStyles();
  const navigate = useMedplumNavigate();
  const activeLink = getActiveLink(props.pathname, props.searchParams, props.menus);
  const [bookmarkDialogVisible, setBookmarkDialogVisible] = useState(false);

  function onLinkClick(e: React.SyntheticEvent, to: string): void {
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
      <MantineNavbar width={{ sm: 250 }} p="xs">
        <ScrollArea>
          <MantineNavbar.Section mb="sm">
            <CodeInput
              key={window.location.pathname}
              name="resourceType"
              placeholder="Resource Type"
              property={{
                binding: {
                  valueSet: 'https://medplum.com/fhir/ValueSet/resource-types',
                },
              }}
              onChange={(newValue) => navigateResourceType(newValue)}
              creatable={false}
              maxSelectedValues={0}
              clearSearchOnChange={true}
              clearable={false}
            />
          </MantineNavbar.Section>
          <MantineNavbar.Section grow>
            {props.menus?.map((menu) => (
              <React.Fragment key={`menu-${menu.title}`}>
                <Text className={classes.menuTitle}>{menu.title}</Text>
                {menu.links?.map((link) => (
                  <NavbarLink
                    key={link.href}
                    to={link.href}
                    active={link.href === activeLink?.href}
                    onClick={(e) => onLinkClick(e, link.href)}
                  >
                    <NavLinkIcon to={link.href} icon={link.icon} />
                    <span>{link.label}</span>
                  </NavbarLink>
                ))}
              </React.Fragment>
            ))}
            {props.displayAddBookmark && (
              <Button
                variant="subtle"
                size="xs"
                mt="xl"
                leftIcon={<IconPlus size="0.75rem" />}
                onClick={() => setBookmarkDialogVisible(true)}
              >
                Add Bookmark
              </Button>
            )}
          </MantineNavbar.Section>
        </ScrollArea>
      </MantineNavbar>
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
  to: string;
  active: boolean;
  onClick: React.MouseEventHandler;
  children: React.ReactNode;
}

function NavbarLink(props: NavbarLinkProps): JSX.Element {
  const { classes, cx } = useStyles();
  return (
    <MedplumLink
      onClick={props.onClick}
      to={props.to}
      className={cx(classes.link, { [classes.linkActive]: props.active })}
    >
      {props.children}
    </MedplumLink>
  );
}

interface NavLinkIconProps {
  to: string;
  icon?: JSX.Element;
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
 * @param currentPathname The web browser current pathname.
 * @param currentSearchParams The web browser current search parameters.
 * @param menus Collection of navbar menus and links.
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
 * @param currentPathname The web browser current pathname.
 * @param currentSearchParams The web browser current search parameters.
 * @param linkHref A candidate link href.
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
