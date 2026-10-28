// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { Flex, Stack, Text } from '@mantine/core';
import type { JSX } from 'react';

export function LabSelectEmpty(): JSX.Element {
  return (
    <Flex direction="column" h="100%" justify="center" align="center">
      <Stack align="center" gap="md" pt="xl">
        <Text size="md" c="dimmed" fw={400}>
          Lab details will appear here when selected.
        </Text>
      </Stack>
    </Flex>
  );
}
