import {
  Avatar,
  Group,
  AppShell as MantineAppShell,
  MantineColorScheme,
  Menu,
  SegmentedControl,
  Stack,
  Text,
  UnstyledButton,
  useMantineColorScheme,
} from '@mantine/core';
import { ProfileResource, formatHumanName, getReferenceString } from '@medplum/core';
import { HumanName } from '@medplum/fhirtypes';
import { useMedplumContext } from '@medplum/react-hooks';
import { IconChevronDown, IconLogout, IconSettings, IconSwitchHorizontal } from '@tabler/icons-react';
import cx from 'clsx';
import { ReactNode, useState } from 'react';
import { HumanNameDisplay } from '../HumanNameDisplay/HumanNameDisplay';
import { ResourceAvatar } from '../ResourceAvatar/ResourceAvatar';
import classes from './Header.module.css';
import { HeaderSearchInput } from './HeaderSearchInput';

export interface HeaderProps {
  pathname?: string;
  searchParams?: URLSearchParams;
  headerSearchDisabled?: boolean;
  logo: ReactNode;
  version?: string;
  navbarToggle: () => void;
}

export function Header(props: HeaderProps): JSX.Element {
  const context = useMedplumContext();
  const { medplum, profile, navigate } = context;
  const logins = medplum.getLogins();
  const [userMenuOpened, setUserMenuOpened] = useState(false);
  const { colorScheme, setColorScheme } = useMantineColorScheme();

  return (
    <MantineAppShell.Header p={8} style={{ zIndex: 101 }}>
      <Group justify="space-between">
        <Group gap="xs">
          <UnstyledButton className={classes.logoButton} onClick={props.navbarToggle}>
            {props.logo}
          </UnstyledButton>
          {!props.headerSearchDisabled && (
            <HeaderSearchInput pathname={props.pathname} searchParams={props.searchParams} />
          )}
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
              <Group gap={7}>
                <ResourceAvatar value={profile} radius="xl" size={24} />
                <Text size="sm" className={classes.userName}>
                  {formatHumanName(profile?.name?.[0] as HumanName)}
                </Text>
                <IconChevronDown size={12} stroke={1.5} />
              </Group>
            </UnstyledButton>
          </Menu.Target>
          <Menu.Dropdown>
            <Stack align="center" p="xl">
              <ResourceAvatar size="xl" radius={100} value={context.profile} />
              <HumanNameDisplay value={context.profile?.name?.[0] as HumanName} />
              <Text c="dimmed" size="xs">
                {medplum.getActiveLogin()?.project.display}
              </Text>
            </Stack>
            {logins.length > 1 && <Menu.Divider />}
            {logins.map(
              (login) =>
                login.profile.reference !== getReferenceString(context.profile as ProfileResource) && (
                  <Menu.Item
                    key={login.profile.reference}
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
                        <Text size="sm" fw={500}>
                          {login.profile.display}
                        </Text>
                        <Text c="dimmed" size="xs">
                          {login.project.display}
                        </Text>
                      </div>
                    </Group>
                  </Menu.Item>
                )
            )}
            <Menu.Divider />
            <Group justify="center">
              <SegmentedControl
                size="xs"
                value={colorScheme}
                onChange={(newValue) => setColorScheme(newValue as MantineColorScheme)}
                data={[
                  { label: 'Light', value: 'light' },
                  { label: 'Dark', value: 'dark' },
                  { label: 'Auto', value: 'auto' },
                ]}
              />
            </Group>
            <Menu.Divider />
            <Menu.Item
              leftSection={<IconSwitchHorizontal size={14} stroke={1.5} />}
              onClick={() => navigate('/signin')}
            >
              Add another account
            </Menu.Item>
            <Menu.Item
              leftSection={<IconSettings size={14} stroke={1.5} />}
              onClick={() => navigate(`/${getReferenceString(profile as ProfileResource)}`)}
            >
              Account settings
            </Menu.Item>
            <Menu.Item
              leftSection={<IconLogout size={14} stroke={1.5} />}
              onClick={async () => {
                await medplum.signOut();
                navigate('/signin');
              }}
            >
              Sign out
            </Menu.Item>
            <Text size="xs" c="dimmed" ta="center">
              {props.version}
            </Text>
          </Menu.Dropdown>
        </Menu>
      </Group>
    </MantineAppShell.Header>
  );
}
