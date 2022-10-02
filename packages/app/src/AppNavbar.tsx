import { createStyles, Navbar, Space, Text } from '@mantine/core';
import { useMedplumContext } from '@medplum/react';
import {
  IconBrandAsana,
  IconBuilding,
  IconForms,
  IconId,
  IconLockAccess,
  IconPackages,
  IconReceipt,
  IconReportMedical,
  IconSquareAsterisk,
  IconStar,
  IconUserCircle,
  IconWebhook,
  TablerIcon,
} from '@tabler/icons';
import React from 'react';
import { NavLink, useNavigate } from 'react-router-dom';

const useStyles = createStyles((theme, _params, getRef) => {
  const icon = getRef('icon');
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
  const profile = context.profile;
  const config = context.medplum.getUserConfiguration();

  function onLinkClick(e: React.SyntheticEvent, to: string): void {
    e.stopPropagation();
    e.preventDefault();
    navigate(to);
    if (window.innerWidth < 768) {
      closeNavbar();
    }
  }

  return (
    <Navbar width={{ sm: 250 }} p="xs">
      <Navbar.Section grow>
        {config?.menu?.map((menu, index) => (
          <React.Fragment key={`menu-${index}-${config?.menu?.length}`}>
            <Text className={classes.menuTitle}>{menu.title}</Text>
            {menu.link?.map((link) => (
              <NavLink
                key={link.name}
                to={link.target as string}
                onClick={(e) => onLinkClick(e, link.target as string)}
                className={({ isActive }) => cx(classes.link, { [classes.linkActive]: isActive })}
              >
                <NavLinkIcon to={link.target as string} className={classes.linkIcon} />
                <span>{link.name}</span>
              </NavLink>
            ))}
          </React.Fragment>
        ))}
        <Text className={classes.menuTitle}>Settings</Text>
        <NavLink
          to={`/${profile?.resourceType}/${profile?.id}`}
          className={({ isActive }) => cx(classes.link, { [classes.linkActive]: isActive })}
        >
          <IconUserCircle className={classes.linkIcon} />
          <span>Profile</span>
        </NavLink>
        <NavLink
          to="/changepassword"
          className={({ isActive }) => cx(classes.link, { [classes.linkActive]: isActive })}
        >
          <IconSquareAsterisk className={classes.linkIcon} />
          <span>Change password</span>
        </NavLink>
      </Navbar.Section>
    </Navbar>
  );
}

interface NavLinkIconProps {
  to: string;
  className: string;
}

const resourceTypeToIcon: Record<string, TablerIcon> = {
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
