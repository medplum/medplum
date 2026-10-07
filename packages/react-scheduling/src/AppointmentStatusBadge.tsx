// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import type { BadgeProps } from '@mantine/core';
import { Badge } from '@mantine/core';
import type { Appointment } from '@medplum/fhirtypes';
import type { JSX } from 'react';

const STATUS_COLORS: Record<Appointment['status'], string> = {
  proposed: 'yellow',
  pending: 'yellow',
  booked: 'blue',
  arrived: 'blue',
  fulfilled: 'blue',
  cancelled: 'red',
  noshow: 'red',
  'entered-in-error': 'red',
  'checked-in': 'blue',
  waitlist: 'gray',
};

export interface AppointmentStatusBadgeProps extends BadgeProps {
  readonly status: Appointment['status'];
}

/**
 * An appointment's status, as a badge in the color for it.
 * @param props - The React props.
 * @returns The badge.
 */
export function AppointmentStatusBadge(props: AppointmentStatusBadgeProps): JSX.Element {
  const { status, ...rest } = props;
  return (
    <Badge color={STATUS_COLORS[status]} {...rest}>
      {status}
    </Badge>
  );
}
