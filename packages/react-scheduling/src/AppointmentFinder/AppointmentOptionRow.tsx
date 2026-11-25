// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { Center, Group, Stack, Text } from '@mantine/core';
import { IconCheck } from '@tabler/icons-react';
import type { JSX } from 'react';

export interface AppointmentOptionRowProps {
  readonly label: string;
  /** What tells this option apart from one of the same name. Omitted when there is nothing on file. */
  readonly detail?: string;
  /**
   * Whether the option is already chosen, which marks it with a check. The check's room is
   * kept while false, so choosing doesn't shift the text; omit it for a list that marks nothing.
   */
  readonly active?: boolean;
}

/**
 * One option in an appointment pick list: what it is called, over what tells it
 * apart from the others.
 * @param props - The React props.
 * @returns The row.
 */
export function AppointmentOptionRow(props: AppointmentOptionRowProps): JSX.Element {
  return (
    <Group gap="xs" wrap="nowrap" align="flex-start">
      {props.active !== undefined && (
        // As tall as the label's line, so the check sits beside the name rather than the detail.
        <Center w={12} h="calc(var(--mantine-font-size-sm) * var(--mantine-line-height-sm))">
          {props.active && <IconCheck size={12} aria-label="Selected" />}
        </Center>
      )}
      <Stack gap={0}>
        <Text size="sm">{props.label}</Text>
        {props.detail && (
          <Text size="xs" c="dimmed">
            {props.detail}
          </Text>
        )}
      </Stack>
    </Group>
  );
}
