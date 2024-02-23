import {
  Avatar,
  Group,
  MantineColorScheme,
  Menu,
  SegmentedControl,
  Stack,
  Text,
  useMantineColorScheme,
} from '@mantine/core';
import { ProfileResource, getReferenceString } from '@medplum/core';
import { HumanName } from '@medplum/fhirtypes';
import { useMedplumContext } from '@medplum/react-hooks';
import { IconLogout, IconSettings, IconSwitchHorizontal } from '@tabler/icons-react';
import { HumanNameDisplay } from '../HumanNameDisplay/HumanNameDisplay';
import { ResourceAvatar } from '../ResourceAvatar/ResourceAvatar';

export interface HeaderDropdownProps {
  readonly version?: string;
}

export function HeaderDropdown(props: HeaderDropdownProps): JSX.Element {
  const context = useMedplumContext();
  const { medplum, profile, navigate } = context;
  const logins = medplum.getLogins();
  const { colorScheme, setColorScheme } = useMantineColorScheme();

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
      <Menu.Item leftSection={<IconSwitchHorizontal size={14} stroke={1.5} />} onClick={() => navigate('/signin')}>
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
    </>
  );
}
