// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { Center, Stack, Text, ThemeIcon } from '@mantine/core';
import { IconCalendarCog } from '@tabler/icons-react';
import type { JSX } from 'react';

export interface ConfigEmptyStateProps {
  /** The selected resource is no longer in the list, rather than nothing having been picked. */
  readonly notFound?: boolean;
}

/**
 * What the detail pane shows while nothing is open.
 * @param props - Whether the selection went missing.
 * @returns The empty state.
 */
export function ConfigEmptyState(props: ConfigEmptyStateProps): JSX.Element {
  const { notFound } = props;
  return (
    <Center py={96}>
      <Stack align="center" gap="md" maw={420}>
        <ThemeIcon size={64} variant="light" color="gray">
          <IconCalendarCog size={32} />
        </ThemeIcon>
        <Stack align="center" gap="xs">
          <Text size="lg" fw={500} c="dimmed">
            {notFound ? 'Not found' : 'Nothing selected'}
          </Text>
          <Text size="sm" c="dimmed" ta="center">
            {notFound
              ? 'It is no longer in the list, and may have been deleted. Pick another from the list.'
              : 'Pick a visit type, provider, room, or device from the list to see and edit how it is scheduled.'}
          </Text>
        </Stack>
      </Stack>
    </Center>
  );
}
