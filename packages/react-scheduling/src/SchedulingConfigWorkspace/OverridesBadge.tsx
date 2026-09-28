// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { Badge, Tooltip, VisuallyHidden } from '@mantine/core';
import type { JSX } from 'react';

export interface OverridesBadgeProps {
  /** What the calendar sets of its own for the visit type, such as `Buffer after` and `custom hours`. */
  readonly overrides: readonly string[];
  readonly serviceName: string;
}

/**
 * Marks a visit type a calendar customizes, naming what it overrides. Renders nothing when the calendar follows
 * the visit type in everything.
 * @param props - What the calendar overrides, and the visit type it otherwise follows.
 * @returns The badge, or null.
 */
export function OverridesBadge(props: OverridesBadgeProps): JSX.Element | null {
  const { overrides, serviceName } = props;
  if (overrides.length === 0) {
    return null;
  }
  const description = `Overrides ${formatList(overrides.map((override) => override.toLowerCase()))}. Everything else follows ${serviceName}.`;
  return (
    <Tooltip label={description} multiline maw={280} withArrow>
      <Badge size="xs" variant="light" color="blue">
        Customized
        <VisuallyHidden>: {description}</VisuallyHidden>
      </Badge>
    </Tooltip>
  );
}

function formatList(items: readonly string[]): string {
  return items.length < 2 ? (items[0] ?? '') : `${items.slice(0, -1).join(', ')} and ${items.at(-1)}`;
}
