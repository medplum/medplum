// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import type { MantineColorScheme } from '@mantine/core';
import { Box, Divider, Flex, Group, Menu, SegmentedControl, Text, useMantineColorScheme } from '@mantine/core';
import type { LoginState, ProfileResource } from '@medplum/core';
import { formatHumanName, getReferenceString, locationUtils } from '@medplum/core';
import { useMedplumContext } from '@medplum/react-hooks';
import type { TablerIcon } from '@tabler/icons-react';
import {
  IconDeviceDesktop,
  IconLogout,
  IconMoon,
  IconPalette,
  IconSettings,
  IconSunHigh,
  IconSwitchHorizontal,
} from '@tabler/icons-react';
import type { JSX } from 'react';
import { useState } from 'react';
import { ProjectLoginOption } from '../auth/ProjectLoginOption';
import { getAppName } from '../utils/app';
import classes from './HeaderDropdown.module.css';

const MENU_ICON_COLOR = 'var(--mantine-color-dimmed)';

const THEME_OPTIONS: { value: string; label: JSX.Element }[] = [
  { value: 'light', label: <ThemeOptionLabel Icon={IconSunHigh} label="Light" /> },
  { value: 'auto', label: <ThemeOptionLabel Icon={IconDeviceDesktop} label="System" /> },
  { value: 'dark', label: <ThemeOptionLabel Icon={IconMoon} label="Dark" /> },
];

function ThemeOptionLabel({
  Icon,
  label,
}: {
  readonly Icon: TablerIcon;
  readonly label: string;
}): JSX.Element {
  return (
    <span aria-label={label} style={{ display: 'flex' }}>
      <Icon size={16} color={MENU_ICON_COLOR} aria-hidden />
    </span>
  );
}

function HeaderDropdownDivider(): JSX.Element {
  return <Divider my={4} mx={4} className={classes.divider} />;
}

function isSameLogin(a: LoginState, b: LoginState | undefined): boolean {
  if (!b) {
    return false;
  }
  return a.project.reference === b.project.reference && a.profile.reference === b.profile.reference;
}

function getLoginKey(login: LoginState): string {
  return `${login.project.reference}-${login.profile.reference}`;
}

export interface HeaderDropdownProps {
  readonly version?: string;
  readonly showLayoutVersionToggle?: boolean;
}

export function HeaderDropdown(props: HeaderDropdownProps): JSX.Element {
  const context = useMedplumContext();
  const { medplum, profile, navigate } = context;
  const activeLogin = medplum.getActiveLogin();
  const logins = medplum.getLogins();
  const recentLogins = logins.filter((login) => !isSameLogin(login, activeLogin));
  const { colorScheme, setColorScheme } = useMantineColorScheme();
  const [layoutVersion] = useState((localStorage['appShellLayoutVersion'] as 'v1' | 'v2' | undefined) ?? 'v1');
  const showLayoutToggle = props.showLayoutVersionToggle ?? true;

  const projectDisplay = activeLogin?.project.display;
  const profileDisplay = activeLogin?.profile.display ?? (profile ? formatHumanName(profile.name?.[0]) : undefined);

  function setAppShellVersion(version: 'v1' | 'v2'): void {
    localStorage['appShellLayoutVersion'] = version;
    locationUtils.reload();
  }

  function switchLogin(login: LoginState): void {
    medplum
      .setActiveLogin(login)
      .then(() => locationUtils.reload())
      .catch(console.error);
  }

  return (
    <>
      <Box className={classes.accountSection}>
        <Box className={classes.projectOption}>
          <ProjectLoginOption projectDisplay={projectDisplay} profileDisplay={profileDisplay} selected />
        </Box>
      </Box>
      {recentLogins.length > 0 && (
        <>
          <HeaderDropdownDivider />
          {recentLogins.map((login) => (
            <Menu.Item
              key={getLoginKey(login)}
              className={classes.recentProjectItem}
              onClick={() => switchLogin(login)}
            >
              <Box className={classes.projectOption}>
                <ProjectLoginOption projectDisplay={login.project.display} profileDisplay={login.profile.display} />
              </Box>
            </Menu.Item>
          ))}
        </>
      )}
      <HeaderDropdownDivider />
      <Menu.Item
        leftSection={<IconSwitchHorizontal size={16} color={MENU_ICON_COLOR} />}
        onClick={() => navigate('/signin')}
      >
        <Text size="sm">Switch to another project</Text>
      </Menu.Item>
      <Menu.Item
        leftSection={<IconSettings size={16} color={MENU_ICON_COLOR} />}
        onClick={() => navigate(`/${getReferenceString(profile as ProfileResource)}`)}
      >
        <Text size="sm">Account settings</Text>
      </Menu.Item>

      <Flex className={classes.appearanceRow} align="center" pl="sm" pr="xs" py="xs">
        <Flex align="center" gap="xs">
          <IconPalette size={16} color={MENU_ICON_COLOR} />
          <Text size="sm">Appearance</Text>
        </Flex>
        <Box className={classes.appearanceControlWrapper}>
          <SegmentedControl
            classNames={{ root: classes.appearanceControl }}
            size="xs"
            radius="xl"
            withItemsBorders={false}
            value={colorScheme}
            onChange={(newValue) => setColorScheme(newValue as MantineColorScheme)}
            data={THEME_OPTIONS}
          />
        </Box>
      </Flex>
      {showLayoutToggle && (
        <Group justify="center" px="sm" pb="xs">
          <SegmentedControl
            size="xs"
            value={layoutVersion}
            onChange={(newValue) => setAppShellVersion(newValue as 'v1' | 'v2')}
            data={[
              { label: 'v1', value: 'v1' },
              { label: 'v2', value: 'v2' },
            ]}
          />
        </Group>
      )}
      <Menu.Item
        leftSection={<IconLogout size={16} color={MENU_ICON_COLOR} />}
        onClick={async () => {
          await medplum.signOut();
          navigate('/signin');
        }}
      >
        <Text size="sm">Sign out</Text>
      </Menu.Item>
      <HeaderDropdownDivider />
      <Text size="xs" c="dimmed" fw={500} my="sm" ta="center">
        {getAppName()} {props.version}
      </Text>
    </>
  );
}
