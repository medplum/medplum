// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { Badge, Tooltip, VisuallyHidden } from '@mantine/core';
import type { JSX } from 'react';

export interface OverridesBadgeProps {
  /** The visit type the Schedule customizes. */
  readonly serviceName: string;
}

/**
 * Marks a visit type a Schedule customizes, saying that what it sets wins over the visit type's own.
 * @param props - The visit type the Schedule customizes.
 * @returns The badge.
 */
export function OverridesBadge(props: OverridesBadgeProps): JSX.Element {
  const description = `Parameter values defined here override those on the ${props.serviceName} visit type.`;
  return (
    <Tooltip label={description} multiline maw={280} withArrow>
      <Badge size="xs" variant="light" color="blue">
        Customized
        <VisuallyHidden>: {description}</VisuallyHidden>
      </Badge>
    </Tooltip>
  );
}
