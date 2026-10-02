// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { ActionIcon, Text, Tooltip } from '@mantine/core';
import { IconInfoCircle } from '@tabler/icons-react';
import type { JSX } from 'react';

/**
 * How badly the missing dependency degrades the field: `warning` when the field is still usable
 * (e.g. it accepts free text and has only lost its suggestions), `error` when it is not.
 */
export type UnavailableNoteSeverity = 'warning' | 'error';

const SEVERITY_COLORS: Record<UnavailableNoteSeverity, string> = {
  warning: 'yellow.9',
  error: 'red',
};

export interface UnavailableNoteProps {
  readonly text: string;
  /** Defaults to `warning`. */
  readonly severity?: UnavailableNoteSeverity;
  /** When set, overrides the color `severity` would pick. */
  readonly color?: string;
  readonly message: string;
}

export function UnavailableNote({ text, severity = 'warning', color, message }: UnavailableNoteProps): JSX.Element {
  const noteColor = color ?? SEVERITY_COLORS[severity];
  return (
    <Text span size="xs" c={noteColor}>
      {text}
      <Tooltip label={message} position="top-start" withArrow events={{ hover: true, focus: true, touch: true }}>
        <ActionIcon
          variant="subtle"
          color={noteColor}
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
