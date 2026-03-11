// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { Center, Flex, Stack, Text, ThemeIcon } from '@mantine/core';
import { IconFileText } from '@tabler/icons-react';
import type { JSX } from 'react';

export function DocumentSelectEmpty(): JSX.Element {
  return (
    <Flex direction="row" h="100%" w="100%">
      <Center h="100%" w="100%">
        <Stack align="center" gap="md">
          <ThemeIcon size={64} variant="light" color="gray">
            <IconFileText size={32} />
          </ThemeIcon>
          <Stack align="center" gap="xs">
            <Text size="lg" fw={500} c="dimmed">
              No document selected
            </Text>
            <Text size="sm" c="dimmed" ta="center">
              Select a document from the list to preview its contents and manage details
            </Text>
          </Stack>
        </Stack>
      </Center>
    </Flex>
  );
}
