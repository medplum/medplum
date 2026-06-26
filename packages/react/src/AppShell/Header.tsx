// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { Box, Group, AppShell as MantineAppShell, Menu, Text, UnstyledButton } from '@mantine/core';
import { formatHumanName } from '@medplum/core';
import { useMedplumProfile } from '@medplum/react-hooks';
import { IconChevronDown } from '@tabler/icons-react';
import type { JSX, ReactNode } from 'react';
import { useState } from 'react';
import { ResourceAvatar } from '../ResourceAvatar/ResourceAvatar';
import type { AppShellAnnouncement } from './AnnouncementBanners';
import { AnnouncementBanners } from './AnnouncementBanners';
import classes from './Header.module.css';
import { HeaderDropdown } from './HeaderDropdown';
import headerDropdownClasses from './HeaderDropdown.module.css';
import { HeaderSearchInput } from './HeaderSearchInput';

export interface HeaderProps {
  readonly pathname?: string;
  readonly searchParams?: URLSearchParams;
  readonly headerSearchDisabled?: boolean;
  readonly logo: ReactNode;
  readonly version?: string;
  readonly navbarOpen?: boolean;
  readonly navbarToggle: () => void;
  readonly notifications?: ReactNode;
  readonly announcements?: AppShellAnnouncement[];
  readonly onDismissAnnouncement?: (announcement: AppShellAnnouncement) => void;
}

export function Header(props: HeaderProps): JSX.Element {
  const profile = useMedplumProfile();
  const [userMenuOpened, setUserMenuOpened] = useState(false);

  return (
    <MantineAppShell.Header p={0} style={{ zIndex: 101 }}>
      <Box p={8} h={60}>
        <Group justify="space-between">
          <Group gap="xs">
            <UnstyledButton
              className={classes.logoButton}
              aria-expanded={props.navbarOpen}
              aria-controls="navbar"
              onClick={() => props.navbarToggle()}
            >
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
              shadow="md"
              radius="md"
              position="bottom-end"
              transitionProps={{ transition: 'fade-down' }}
              opened={userMenuOpened}
              onClose={() => setUserMenuOpened(false)}
            >
              <Menu.Target>
                <UnstyledButton
                  className={classes.user}
                  aria-label="User menu"
                  data-active={userMenuOpened || undefined}
                  onClick={() => setUserMenuOpened((o) => !o)}
                >
                  <Group gap={7}>
                    <ResourceAvatar value={profile} radius="xl" size={24} />
                    <Text size="sm" className={classes.userName}>
                      {formatHumanName(profile?.name?.[0])}
                    </Text>
                    <IconChevronDown size={12} stroke={1.5} />
                  </Group>
                </UnstyledButton>
              </Menu.Target>
              <Menu.Dropdown className={headerDropdownClasses.dropdown}>
                <HeaderDropdown version={props.version} />
              </Menu.Dropdown>
            </Menu>
          </Group>
        </Group>
      </Box>
      {!!props.announcements?.length && props.onDismissAnnouncement && (
        <AnnouncementBanners announcements={props.announcements} onDismiss={props.onDismissAnnouncement} />
      )}
    </MantineAppShell.Header>
  );
}
