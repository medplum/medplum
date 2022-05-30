import { Period } from '@medplum/fhirtypes';
import React from 'react';
import { DateTimeDisplay } from './DateTimeDisplay';

export interface PeriodDisplayProps {
  value?: Period;
}

export function PeriodDisplay(props: PeriodDisplayProps): JSX.Element | null {
  const value = props.value;
  if (!value || (!value.start && !value.end)) {
    return null;
  }

  return (
    <span>
      <DateTimeDisplay value={value.start} />
      -
      <DateTimeDisplay value={value.end} />
    </span>
  );
}
