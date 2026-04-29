// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { Center, Flex, Stack, Text, ThemeIcon } from '@mantine/core';
import { IconMailOpened } from '@tabler/icons-react';
import type { JSX } from 'react';

export function FaxSelectEmpty(): JSX.Element {
  return (
    <Flex direction="row" h="100%" w="100%">
      <Center h="100%" w="100%">
        <Stack align="center" gap="md">
          <ThemeIcon size={64} variant="light" color="gray">
            <IconMailOpened size={32} />
          </ThemeIcon>
          <Stack align="center" gap="xs">
            <Text size="lg" fw={500} c="dimmed">
              No fax selected
            </Text>
            <Text size="sm" c="dimmed" ta="center">
              Select a fax from the list to view its contents and details
            </Text>
          </Stack>
        </Stack>
      </Center>
    </Flex>
  );
}
