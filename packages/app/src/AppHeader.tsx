import { Avatar, createStyles, Group, Header, Menu, Stack, Text, UnstyledButton } from '@mantine/core';
import { formatHumanName, getReferenceString, MEDPLUM_VERSION, ProfileResource } from '@medplum/core';
import { HumanName } from '@medplum/fhirtypes';
import { HumanNameDisplay, Logo, ResourceAvatar, useMedplumContext } from '@medplum/react';
import { IconChevronDown, IconLogout, IconSettings, IconSwitchHorizontal } from '@tabler/icons-react';
import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { HeaderSearchInput } from './components/HeaderSearchInput';

const useStyles = createStyles((theme) => ({
  logoButton: {
    padding: `${theme.spacing.xs} ${theme.spacing.sm}`,
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
    padding: `${theme.spacing.xs} ${theme.spacing.sm}`,
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

interface AppHeaderProps {
  navbarToggle: () => void;
}

export function AppHeader({ navbarToggle }: AppHeaderProps): JSX.Element {
  const context = useMedplumContext();
  const medplum = context.medplum;
  const profile = context.profile as ProfileResource;
  const logins = medplum.getLogins();
  const { classes, cx } = useStyles();
  const [userMenuOpened, setUserMenuOpened] = useState(false);
  const navigate = useNavigate();

  return (
    <Header height={60} p={8} style={{ zIndex: 101 }}>
      <Group position="apart">
        <Group spacing="xs">
          <UnstyledButton className={classes.logoButton} onClick={navbarToggle}>
            <Logo size={24} />
          </UnstyledButton>
          <HeaderSearchInput />
        </Group>

        <Menu
          width={260}
          shadow="xl"
          position="bottom-end"
          transitionProps={{ transition: 'pop-top-right' }}
          opened={userMenuOpened}
          onClose={() => setUserMenuOpened(false)}
        >
          <Menu.Target>
            <UnstyledButton
              className={cx(classes.user, { [classes.userActive]: userMenuOpened })}
              onClick={() => setUserMenuOpened((o) => !o)}
            >
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
            <Stack align="center" p="xl">
              <ResourceAvatar size="xl" radius={100} value={context.profile} />
              <HumanNameDisplay value={context.profile?.name?.[0] as HumanName} />
              <Text color="dimmed" size="xs">
                {medplum.getActiveLogin()?.project?.display}
              </Text>
            </Stack>
            {logins.length > 1 && <Menu.Divider />}
            {logins.map(
              (login) =>
                login.profile?.reference !== getReferenceString(context.profile as ProfileResource) && (
                  <Menu.Item
                    key={login.profile?.reference}
                    onClick={() => {
                      medplum
                        .setActiveLogin(login)
                        .then(() => window.location.reload())
                        .catch(console.log);
                    }}
                  >
                    <Group>
                      <Avatar radius="xl" />
                      <div style={{ flex: 1 }}>
                        <Text size="sm" weight={500}>
                          {login.profile?.display}
                        </Text>
                        <Text color="dimmed" size="xs">
                          {login.project?.display}
                        </Text>
                      </div>
                    </Group>
                  </Menu.Item>
                )
            )}
            <Menu.Divider />
            <Menu.Item icon={<IconSwitchHorizontal size={14} stroke={1.5} />} onClick={() => navigate('/signin')}>
              Add another account
            </Menu.Item>
            <Menu.Item
              icon={<IconSettings size={14} stroke={1.5} />}
              onClick={() => navigate(`/${getReferenceString(profile)}`)}
            >
              Account settings
            </Menu.Item>
            <Menu.Item
              icon={<IconLogout size={14} stroke={1.5} />}
              onClick={async () => {
                await medplum.signOut();
                navigate('/signin');
              }}
            >
              Sign out
            </Menu.Item>
            <Text size="xs" color="dimmed" align="center">
              {MEDPLUM_VERSION}
            </Text>
          </Menu.Dropdown>
        </Menu>
      </Group>
    </Header>
  );
}
