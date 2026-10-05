// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import type { Slot } from '@medplum/fhirtypes';
import type { JSX } from 'react';
import { useMemo } from 'react';
import { CalendarDateInput } from '../CalendarDateInput/CalendarDateInput';

/** @deprecated Use CalendarDateInputProps instead. */
export interface CalendarInputProps {
  readonly slots: Slot[];
  readonly onChangeMonth: (date: Date) => void;
  readonly onClick: (date: Date) => void;
}

/**
 * A calendar that marks the days with slots as available.
 * @deprecated Use CalendarDateInput instead, which takes the available dates directly
 * and supports month navigation, a controlled selection, and date ranges.
 * @param props - The Input props.
 * @returns The JSX element to render.
 */
export function CalendarInput(props: CalendarInputProps): JSX.Element {
  const { slots, ...rest } = props;
  const availableDates = useMemo(() => slots.map((slot) => new Date(slot.start)), [slots]);
  return <CalendarDateInput {...rest} availableDates={availableDates} />;
}
