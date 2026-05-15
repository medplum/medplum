// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import type { Slot } from '@medplum/fhirtypes';
import type { JSX } from 'react';
import { useMemo } from 'react';
import { CalendarDateInput } from '../CalendarDateInput/CalendarDateInput';

export interface CalendarInputProps {
  readonly slots: Slot[];
  readonly onChangeMonth: (date: Date) => void;
  readonly onClick: (date: Date) => void;
}

export function CalendarInput(props: CalendarInputProps): JSX.Element {
  const { slots, ...rest } = props;
  const availableDates = useMemo(() => slots.map((slot) => new Date(slot.start)), [slots]);
  return <CalendarDateInput {...rest} availableDates={availableDates} />;
}
