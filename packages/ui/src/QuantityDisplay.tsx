import { Quantity } from '@medplum/fhirtypes';
import React from 'react';

export interface QuantityDisplayProps {
  value?: Quantity;
}

export function QuantityDisplay(props: QuantityDisplayProps): JSX.Element | null {
  const value = props.value;
  if (!value) {
    return null;
  }

  return (
    <span>
      {value.comparator} {value.value} {value.unit}
    </span>
  );
}
