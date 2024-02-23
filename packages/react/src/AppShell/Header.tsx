import { Group, AppShell as MantineAppShell, Menu, Text, UnstyledButton } from '@mantine/core';
import { formatHumanName } from '@medplum/core';
import { HumanName } from '@medplum/fhirtypes';
import { useMedplumProfile } from '@medplum/react-hooks';
import { IconChevronDown } from '@tabler/icons-react';
import cx from 'clsx';
import { ReactNode, useState } from 'react';
import { ResourceAvatar } from '../ResourceAvatar/ResourceAvatar';
import classes from './Header.module.css';
import { HeaderDropdown } from './HeaderDropdown';
import { HeaderSearchInput } from './HeaderSearchInput';

export interface HeaderProps {
  readonly pathname?: string;
  readonly searchParams?: URLSearchParams;
  readonly headerSearchDisabled?: boolean;
  readonly logo: ReactNode;
  readonly version?: string;
  readonly navbarToggle: () => void;
  readonly notifications?: ReactNode;
}

export function Header(props: HeaderProps): JSX.Element {
  const profile = useMedplumProfile();
  const [userMenuOpened, setUserMenuOpened] = useState(false);

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
        <Group gap="lg" pr="sm">
          {props.notifications}
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
              <HeaderDropdown version={props.version} />
            </Menu.Dropdown>
          </Menu>
        </Group>
      </Group>
    </MantineAppShell.Header>
  );
}
