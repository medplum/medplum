// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { Badge } from '@mantine/core';
import type { JSX } from 'react';

/** Whether a visit type, or a provider, room, or device and its Schedule, can be booked. */
export type ConfigStatus = 'active' | 'schedule-inactive' | 'inactive';

const BADGES: Record<ConfigStatus, { readonly label: string; readonly color: string }> = {
  active: { label: 'Active', color: 'green' },
  'schedule-inactive': { label: 'Schedule inactive', color: 'orange' },
  inactive: { label: 'Inactive', color: 'gray' },
};

export interface StatusBadgeProps {
  readonly status: ConfigStatus;
}

/**
 * The status shown beside a configuration page's title, colored as the sidebar marks it.
 * @param props - The status.
 * @returns The badge.
 */
export function StatusBadge(props: StatusBadgeProps): JSX.Element {
  const { label, color } = BADGES[props.status];
  return (
    <Badge variant="light" color={color}>
      {label}
    </Badge>
  );
}
