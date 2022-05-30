import { Range } from '@medplum/fhirtypes';
import React from 'react';
import { QuantityDisplay } from './QuantityDisplay';

export interface RangeDisplayProps {
  value?: Range;
}

export function RangeDisplay(props: RangeDisplayProps): JSX.Element | null {
  const value = props.value;
  if (!value || (!value.low && !value.high)) {
    return null;
  }

  if (value.low && !value.high) {
    return (
      <span>
        &gt;=&nbsp;
        <QuantityDisplay value={value.low} />
      </span>
    );
  }

  if (!value.low && value.high) {
    return (
      <span>
        &lt;=&nbsp;
        <QuantityDisplay value={value.high} />
      </span>
    );
  }

  return (
    <span>
      <QuantityDisplay value={value.low} />
      &nbsp;-&nbsp;
      <QuantityDisplay value={value.high} />
    </span>
  );
}
