import { formatQuantity } from '@medplum/core';
import { Quantity } from '@medplum/fhirtypes';
import React from 'react';

export interface QuantityDisplayProps {
  value?: Quantity;
}

export function QuantityDisplay(props: QuantityDisplayProps): JSX.Element | null {
  return <>{formatQuantity(props.value)}</>;
}
