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

  return <>{formatQuantityString(value)}</>;
}

export function formatQuantityString(quantity: Quantity): string {
  const result = [];

  if (quantity.comparator) {
    result.push(quantity.comparator);
    result.push(' ');
  }

  if (quantity.value !== undefined) {
    result.push(quantity.value);
  }

  if (quantity.unit) {
    if (quantity.unit !== '%') {
      result.push(' ');
    }
    result.push(quantity.unit);
  }

  return result.join('');
}
