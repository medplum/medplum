// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { Center, Stack, Text, ThemeIcon } from '@mantine/core';
import { IconClipboardList } from '@tabler/icons-react';
import { JSX } from 'react';

interface TaskSelectEmptyProps {
  notFound?: boolean;
}

export function TaskSelectEmpty(props: TaskSelectEmptyProps): JSX.Element {
  const { notFound = false } = props;
  return (
    <Center h="100%" w="100%">
      <Stack align="center" gap="md">
        <ThemeIcon size={64} variant="light" color="gray">
          <IconClipboardList size={32} />
        </ThemeIcon>
        <Stack align="center" gap="xs">
          <Text size="lg" fw={500} c="dimmed">
            {notFound ? 'Task not found' : 'No task selected'}
          </Text>
          {!notFound && (
            <Text size="sm" c="dimmed" ta="center">
              Select a task from the list to view details, add notes, and manage properties
            </Text>
          )}
        </Stack>
      </Stack>
    </Center>
  );
}
