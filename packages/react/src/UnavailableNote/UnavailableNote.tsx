// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { ActionIcon, Text, Tooltip } from '@mantine/core';
import { IconInfoCircle } from '@tabler/icons-react';
import type { JSX } from 'react';

export interface UnavailableNoteProps {
  readonly text: string;
  readonly color: string;
  readonly message: string;
}

export function UnavailableNote({ text, color, message }: UnavailableNoteProps): JSX.Element {
  return (
    <Text span size="xs" c={color}>
      {text}
      <Tooltip label={message} position="top-start" withArrow events={{ hover: true, focus: true, touch: true }}>
        <ActionIcon
          variant="subtle"
          color={color}
          size={16}
          ml={4}
          aria-label={`Why is this unavailable? ${message}`}
          style={{ verticalAlign: 'text-bottom' }}
        >
          <IconInfoCircle size={14} />
        </ActionIcon>
      </Tooltip>
    </Text>
  );
}
