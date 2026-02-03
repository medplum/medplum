// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import type { MantineColorScheme } from '@mantine/core';
import { Avatar, Group, Menu, SegmentedControl, Stack, Text, useMantineColorScheme } from '@mantine/core';
import type { ProfileResource } from '@medplum/core';
import { getReferenceString, locationUtils } from '@medplum/core';
import type { HumanName } from '@medplum/fhirtypes';
import { useMedplumContext } from '@medplum/react-hooks';
import { IconLogout, IconSettings, IconSwitchHorizontal } from '@tabler/icons-react';
import type { JSX } from 'react';
import { useState } from 'react';
import { HumanNameDisplay } from '../HumanNameDisplay/HumanNameDisplay';
import { ResourceAvatar } from '../ResourceAvatar/ResourceAvatar';
import { getAppName } from '../utils/app';

export interface HeaderDropdownProps {
  readonly version?: string;
  readonly showLayoutVersionToggle?: boolean;
}

export function HeaderDropdown(props: HeaderDropdownProps): JSX.Element {
  const context = useMedplumContext();
  const { medplum, profile, navigate } = context;
  const logins = medplum.getLogins();
  const { colorScheme, setColorScheme } = useMantineColorScheme();
  const [layoutVersion] = useState((localStorage['appShellLayoutVersion'] as 'v1' | 'v2' | undefined) ?? 'v1');
  const showLayoutToggle = props.showLayoutVersionToggle ?? true;

  function setAppShellVersion(version: 'v1' | 'v2'): void {
    localStorage['appShellLayoutVersion'] = version;
    locationUtils.reload();
  }

  return (
    <>
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
                  .then(() => locationUtils.reload())
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
      <Menu.Item leftSection={<IconSwitchHorizontal size={14} stroke={1.5} />} onClick={() => navigate('/signin')}>
        Switch to another project
      </Menu.Item>
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
        {showLayoutToggle && (
          <SegmentedControl
            size="xs"
            value={layoutVersion}
            onChange={(newValue) => setAppShellVersion(newValue as 'v1' | 'v2')}
            data={[
              { label: 'v1', value: 'v1' },
              { label: 'v2', value: 'v2' },
            ]}
          />
        )}
      </Group>
      <Menu.Divider />
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
      <Text size="xs" c="dimmed" my="sm" ta="center">
        {getAppName()} {props.version}
      </Text>
    </>
  );
}
