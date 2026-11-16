// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { Stack, Text } from '@mantine/core';
import type { JSX, ReactNode } from 'react';

export interface DetailProps {
  readonly label: string;
  /** Left out entirely when there is nothing on file for it. */
  readonly value?: ReactNode;
}

/**
 * One labelled line of what is on file, or nothing at all when it is not.
 * @param props - The React props.
 * @returns The line, or null.
 */
export function Detail(props: DetailProps): JSX.Element | null {
  if (!props.value) {
    return null;
  }
  return (
    <Stack gap={0}>
      <Text size="xs" c="dimmed">
        {props.label}
      </Text>
      <Text size="sm">{props.value}</Text>
    </Stack>
  );
}
