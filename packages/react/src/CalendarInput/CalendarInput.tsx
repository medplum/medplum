// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import type { Slot } from '@medplum/fhirtypes';
import type { JSX } from 'react';
import { useMemo } from 'react';
import type { CalendarDateInputProps } from '../CalendarDateInput/CalendarDateInput';
import { CalendarDateInput } from '../CalendarDateInput/CalendarDateInput';

export interface CalendarInputProps extends Omit<CalendarDateInputProps, 'availableDates'> {
  readonly slots: Slot[];
}

/**
 * A calendar of the days a set of Slot resources fall on.
 * @param props - The calendar props, which are CalendarDateInput's with the
 * available dates read off Slot resources instead.
 * @returns The calendar.
 * @deprecated Use CalendarDateInput instead, mapping slots to their start dates.
 * This wrapper will be removed in a future major version.
 */
export function CalendarInput(props: CalendarInputProps): JSX.Element {
  const { slots, ...rest } = props;
  const availableDates = useMemo(() => slots.map((slot) => new Date(slot.start)), [slots]);
  return <CalendarDateInput {...rest} availableDates={availableDates} />;
}
