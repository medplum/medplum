import { Quantity } from '@medplum/core';
import React from 'react';

export interface QuantityDisplayProps {
  value?: Quantity;
}

export function QuantityDisplay(props: QuantityDisplayProps) {
  const value = props.value;
  if (!value) {
    return null;
  }

  return (
    <span>{value.value} {value.unit}</span>
  );
}
