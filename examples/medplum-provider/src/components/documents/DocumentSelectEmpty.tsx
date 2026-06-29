// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { Flex, Text } from '@mantine/core';
import type { JSX } from 'react';

export function DocumentSelectEmpty(): JSX.Element {
  return (
    <Flex direction="column" h="100%" justify="center" align="center">
      <Text size="md" c="dimmed" fw={400}>
        Document details will appear here when selected.
      </Text>
    </Flex>
  );
}
