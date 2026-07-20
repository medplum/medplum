// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import type { MantineColor } from '@mantine/core';
import { Box, CloseButton, Group, Text } from '@mantine/core';
import type { AriaRole, JSX, ReactNode } from 'react';
import classes from './AppShell.module.css';

export interface AppShellAnnouncement {
  readonly id?: string;
  readonly message: ReactNode;
  readonly color?: MantineColor;
  readonly icon?: ReactNode;
  readonly dismissible?: boolean;
  readonly onDismiss?: (announcement: AppShellAnnouncement) => void;
  readonly role?: AriaRole;
}

interface AnnouncementBannersProps {
  readonly announcements: AppShellAnnouncement[];
  readonly onDismiss: (announcement: AppShellAnnouncement) => void;
}

export function AnnouncementBanners(props: AnnouncementBannersProps): JSX.Element {
  return (
    <>
      {props.announcements.map((announcement, index) => (
        <Box
          key={announcement.id ?? index}
          className={classes.announcement}
          style={{
            backgroundColor: `var(--mantine-color-${announcement.color ?? 'yellow'}-light)`,
            color: `var(--mantine-color-${announcement.color ?? 'yellow'}-light-color)`,
          }}
          role={announcement.role ?? 'status'}
        >
          <Group gap="xs" wrap="nowrap" h="100%" px="md">
            {announcement.icon}
            <Text size="sm" fw={500} truncate>
              {announcement.message}
            </Text>
            {announcement.dismissible && (
              <CloseButton
                size="sm"
                variant="subtle"
                aria-label="Dismiss announcement"
                onClick={() => props.onDismiss(announcement)}
                ml="auto"
              />
            )}
          </Group>
        </Box>
      ))}
    </>
  );
}
