import { createStyles, Group, Header, Menu, Text, UnstyledButton } from '@mantine/core';
import { formatHumanName, getReferenceString, ProfileResource } from '@medplum/core';
import { HumanName } from '@medplum/fhirtypes';
import { Logo, ResourceAvatar, useMedplum, useMedplumProfile } from '@medplum/react';
import { IconChevronDown, IconLogout, IconSettings, IconSwitchHorizontal } from '@tabler/icons';
import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';

const useStyles = createStyles((theme) => ({
  logoButton: {
    padding: `${theme.spacing.xs}px ${theme.spacing.sm}px`,
    borderRadius: theme.radius.sm,
    transition: 'background-color 100ms ease',

    '&:hover': {
      backgroundColor: theme.fn.lighten(
        theme.fn.variant({ variant: 'filled', color: theme.primaryColor }).background as string,
        0.8
      ),
    },
  },

  user: {
    padding: `${theme.spacing.xs}px ${theme.spacing.sm}px`,
    borderRadius: theme.radius.sm,
    transition: 'background-color 100ms ease',

    '&:hover': {
      backgroundColor: theme.fn.lighten(
        theme.fn.variant({ variant: 'filled', color: theme.primaryColor }).background as string,
        0.8
      ),
    },
  },

  userName: {
    fontWeight: 500,
    lineHeight: 1,
    marginRight: 3,

    [theme.fn.smallerThan('xs')]: {
      display: 'none',
    },
  },

  userActive: {
    backgroundColor: theme.fn.lighten(
      theme.fn.variant({ variant: 'filled', color: theme.primaryColor }).background as string,
      0.8
    ),
  },
}));

interface HeaderTabsProps {
  navbarToggle: () => void;
}

export function AppHeader({ navbarToggle }: HeaderTabsProps): JSX.Element {
  const medplum = useMedplum();
  const profile = useMedplumProfile() as ProfileResource;
  const { classes, cx } = useStyles();
  const [userMenuOpened, setUserMenuOpened] = useState(false);
  const navigate = useNavigate();

  return (
    <Header height={60} p={8}>
      <Group position="apart">
        <UnstyledButton className={classes.logoButton} onClick={navbarToggle}>
          <Logo size={24} />
        </UnstyledButton>

        <Menu
          width={260}
          position="bottom-end"
          transition="pop-top-right"
          onClose={() => setUserMenuOpened(false)}
          onOpen={() => setUserMenuOpened(true)}
        >
          <Menu.Target>
            <UnstyledButton className={cx(classes.user, { [classes.userActive]: userMenuOpened })}>
              <Group spacing={7}>
                <ResourceAvatar value={profile} radius="xl" size={24} />
                <Text size="sm" className={classes.userName}>
                  {formatHumanName(profile.name?.[0] as HumanName)}
                </Text>
                <IconChevronDown size={12} stroke={1.5} />
              </Group>
            </UnstyledButton>
          </Menu.Target>
          <Menu.Dropdown>
            <Menu.Label>Settings</Menu.Label>
            <Menu.Item
              icon={<IconSettings size={14} stroke={1.5} />}
              onClick={() => navigate(`/${getReferenceString(profile)}`)}
            >
              Account settings
            </Menu.Item>
            <Menu.Item icon={<IconSwitchHorizontal size={14} stroke={1.5} />}>Change account</Menu.Item>
            <Menu.Item
              icon={<IconLogout size={14} stroke={1.5} />}
              onClick={() => {
                medplum.signOut();
                navigate('/signin');
              }}
            >
              Sign out
            </Menu.Item>
          </Menu.Dropdown>
        </Menu>
      </Group>
    </Header>
  );
}
