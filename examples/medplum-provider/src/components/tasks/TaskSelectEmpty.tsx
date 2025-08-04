import { Center, Stack, Text, ThemeIcon } from '@mantine/core';
import { IconClipboardList } from '@tabler/icons-react';
import { JSX } from 'react';

export function TaskSelectEmpty(): JSX.Element {
  return (
    <Center h="100%" w="100%">
      <Stack align="center" gap="md">
        <ThemeIcon size={64} variant="light" color="gray">
          <IconClipboardList size={32} />
        </ThemeIcon>
        <Stack align="center" gap="xs">
          <Text size="lg" fw={500} c="dimmed">
            No task selected
          </Text>
          <Text size="sm" c="dimmed" ta="center">
            Select a task from the list to view details, add notes, and manage properties
          </Text>
        </Stack>
      </Stack>
    </Center>
  );
}