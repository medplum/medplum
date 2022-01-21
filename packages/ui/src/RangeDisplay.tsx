import { Range } from '@medplum/fhirtypes';
import React from 'react';
import { QuantityDisplay } from './QuantityDisplay';

export interface RangeDisplayProps {
  value?: Range;
}

export function RangeDisplay(props: RangeDisplayProps): JSX.Element | null {
  const value = props.value;
  if (!value) {
    return null;
  }

  return (
    <span>
      <QuantityDisplay value={value.low} />
      &nbsp;-&nbsp;
      <QuantityDisplay value={value.high} />
    </span>
  );
}
