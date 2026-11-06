// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { Text } from '@mantine/core';
import type { JSX } from 'react';

/**
 * Marks an action that has no backend yet.
 * @returns The label.
 */
export function ComingSoon(): JSX.Element {
  return (
    <Text size="xs" c="dimmed">
      Coming soon
    </Text>
  );
}
