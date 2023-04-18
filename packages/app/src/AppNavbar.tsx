import { createStyles, getStylesRef, Navbar, Space, Text } from '@mantine/core';
import { CodeInput, useMedplumContext } from '@medplum/react';
import {
  Icon,
  IconBrandAsana,
  IconBuilding,
  IconForms,
  IconId,
  IconLock,
  IconLockAccess,
  IconMicroscope,
  IconPackages,
  IconReceipt,
  IconReportMedical,
  IconStar,
  IconWebhook,
} from '@tabler/icons-react';
import React from 'react';
import { Link, NavLink, useLocation, useNavigate, useSearchParams } from 'react-router-dom';

const useStyles = createStyles((theme) => {
  const icon = getStylesRef('icon');
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

        [`& .${icon}`]: {
          color: theme.colorScheme === 'dark' ? theme.white : theme.black,
        },
      },
    },

    linkIcon: {
      ref: icon,
      color: theme.colorScheme === 'dark' ? theme.colors.dark[2] : theme.colors.gray[6],
      marginRight: theme.spacing.sm,
      strokeWidth: 1.5,
      width: 18,
      height: 18,
    },

    linkActive: {
      '&, &:hover': {
        backgroundColor: theme.fn.variant({ variant: 'light', color: theme.primaryColor }).background,
        color: theme.fn.variant({ variant: 'light', color: theme.primaryColor }).color,
        [`& .${icon}`]: {
          color: theme.fn.variant({ variant: 'light', color: theme.primaryColor }).color,
        },
      },
    },
  };
});

export interface AppNavbarProps {
  closeNavbar: () => void;
}

export function AppNavbar({ closeNavbar }: AppNavbarProps): JSX.Element {
  const { classes, cx } = useStyles();
  const navigate = useNavigate();
  const context = useMedplumContext();
  const config = context.medplum.getUserConfiguration();

  function onLinkClick(e: React.SyntheticEvent, to: string): void {
    e.stopPropagation();
    e.preventDefault();
    navigate(to);
    if (window.innerWidth < 768) {
      closeNavbar();
    }
  }

  function navigateResourceType(resourceType: string | undefined): void {
    if (resourceType) {
      navigate(`/${resourceType}`);
    }
  }

  return (
    <Navbar width={{ sm: 250 }} p="xs">
      <Navbar.Section>
        <CodeInput
          name="resourceType"
          placeholder="Navigate by Resource Type"
          property={{
            binding: {
              valueSet: 'http://hl7.org/fhir/ValueSet/resource-types',
            },
          }}
          onChange={(newValue) => navigateResourceType(newValue)}
          creatable={false}
          maxSelectedValues={1}
          clearSearchOnChange={false}
        />
      </Navbar.Section>
      <Navbar.Section grow>
        {config?.menu?.map((menu, index) => (
          <React.Fragment key={`menu-${index}-${config?.menu?.length}`}>
            <Text className={classes.menuTitle}>{menu.title}</Text>
            {menu.link?.map((link) => (
              <NavbarLink
                key={link.name}
                to={link.target as string}
                onClick={(e) => onLinkClick(e, link.target as string)}
              >
                <NavLinkIcon to={link.target as string} className={classes.linkIcon} />
                <span>{link.name}</span>
              </NavbarLink>
            ))}
          </React.Fragment>
        ))}
        <Text className={classes.menuTitle}>Settings</Text>
        <NavLink to="/security" className={({ isActive }) => cx(classes.link, { [classes.linkActive]: isActive })}>
          <IconLock className={classes.linkIcon} />
          <span>Security</span>
        </NavLink>
      </Navbar.Section>
    </Navbar>
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
    <Link onClick={props.onClick} to={props.to} className={cx(classes.link, { [classes.linkActive]: isActive })}>
      {props.children}
    </Link>
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
  className: string;
}

const resourceTypeToIcon: Record<string, Icon> = {
  Patient: IconStar,
  Practitioner: IconId,
  Organization: IconBuilding,
  ServiceRequest: IconReceipt,
  DiagnosticReport: IconReportMedical,
  Questionnaire: IconForms,
  admin: IconBrandAsana,
  AccessPolicy: IconLockAccess,
  Subscription: IconWebhook,
  batch: IconPackages,
  Observation: IconMicroscope,
};

function NavLinkIcon({ to, className }: NavLinkIconProps): JSX.Element {
  try {
    const resourceType = new URL(to, 'https://app.medplum.com').pathname.split('/')[1];
    if (resourceType in resourceTypeToIcon) {
      const Icon = resourceTypeToIcon[resourceType];
      return <Icon className={className} />;
    }
  } catch (e) {
    // Ignore
  }
  return <Space w={30} />;
}
