// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { Button, Center, Stack, Text, ThemeIcon } from '@mantine/core';
import { IconCalendarCog, IconPlus } from '@tabler/icons-react';
import type { JSX } from 'react';

export interface ConfigEmptyStateProps {
  /** The selected resource is no longer in the list, rather than nothing having been picked. */
  readonly notFound?: boolean;
  /** Starts a new visit type. Omitted to hide the button. */
  readonly onCreate?: () => void;
}

/**
 * What the detail pane shows while nothing is open.
 * @param props - Whether the selection went missing, and how to start a new visit type.
 * @returns The empty state.
 */
export function ConfigEmptyState(props: ConfigEmptyStateProps): JSX.Element {
  const { notFound, onCreate } = props;
  return (
    <Center py={96}>
      <Stack align="center" gap="md" maw={420}>
        <ThemeIcon size={64} variant="light" color="gray">
          <IconCalendarCog size={32} />
        </ThemeIcon>
        <Stack align="center" gap="xs">
          <Text size="lg" fw={500} c="dimmed">
            {notFound ? 'Visit type not found' : 'No visit type selected'}
          </Text>
          <Text size="sm" c="dimmed" ta="center">
            {notFound
              ? 'It is no longer in the list, and may have been deleted. Pick another from the list.'
              : 'Pick a visit type from the list to see and edit how it is scheduled, or start a new one.'}
          </Text>
        </Stack>
        {onCreate && (
          <Button variant="light" leftSection={<IconPlus size={16} />} onClick={onCreate}>
            New visit type
          </Button>
        )}
      </Stack>
    </Center>
  );
}
