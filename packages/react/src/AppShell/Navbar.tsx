import { createStyles, Navbar as MantineNavbar, Space, Text } from '@mantine/core';
import React from 'react';
import { useLocation, useSearchParams } from 'react-router-dom';
import { MedplumLink } from '../MedplumLink/MedplumLink';
import { useMedplumContext } from '../MedplumProvider/MedplumProvider';

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
  children?: React.ReactNode;
  menus?: NavbarMenu[];
  closeNavbar: () => void;
}

export function Navbar(props: NavbarProps): JSX.Element {
  const { classes } = useStyles();
  const context = useMedplumContext();
  const navigate = context.navigate;
  const config = context.medplum.getUserConfiguration();

  function onLinkClick(e: React.SyntheticEvent, to: string): void {
    e.stopPropagation();
    e.preventDefault();
    navigate(to);
    if (window.innerWidth < 768) {
      props.closeNavbar();
    }
  }

  return (
    <MantineNavbar width={{ sm: 250 }} p="xs">
      {props.children}
      {props.menus && (
        <MantineNavbar.Section grow>
          {props.menus.map((menu, index) => (
            <React.Fragment key={`menu-${index}-${config?.menu?.length}`}>
              <Text className={classes.menuTitle}>{menu.title}</Text>
              {menu.links?.map((link) => (
                <NavbarLink key={link.href} to={link.href as string} onClick={(e) => onLinkClick(e, link.href)}>
                  <NavLinkIcon to={link.href} icon={link.icon} />
                  <span>{link.label}</span>
                </NavbarLink>
              ))}
            </React.Fragment>
          ))}
        </MantineNavbar.Section>
      )}
    </MantineNavbar>
  );
}

interface NavbarLinkProps {
  to: string;
  onClick: React.MouseEventHandler;
  children: React.ReactNode;
}

function NavbarLink(props: NavbarLinkProps): JSX.Element {
  const { classes, cx } = useStyles();
  const location = useLocation();
  const [searchParams] = useSearchParams();
  const toUrl = new URL(props.to, window.location.protocol + '//' + window.location.host);
  const isActive = location.pathname === toUrl.pathname && matchesParams(searchParams, toUrl);

  return (
    <MedplumLink onClick={props.onClick} to={props.to} className={cx(classes.link, { [classes.linkActive]: isActive })}>
      {props.children}
    </MedplumLink>
  );
}

/**
 * Returns true if the search params match.
 * @param searchParams The current search params.
 * @param toUrl The destination URL of the link.
 * @returns True if the search params match.
 */
function matchesParams(searchParams: URLSearchParams, toUrl: URL): boolean {
  for (const [key, value] of toUrl.searchParams.entries()) {
    if (searchParams.get(key) !== value) {
      return false;
    }
  }
  return true;
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
