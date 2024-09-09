import { formatQuantity } from '@medplum/core';
import { Quantity } from '@medplum/fhirtypes';

export interface QuantityDisplayProps {
  readonly value?: Quantity;
}

export function QuantityDisplay(props: QuantityDisplayProps): JSX.Element | null {
  return <>{formatQuantity(props.value)}</>;
}
