import { formatMoney } from '@medplum/core';
import { Money } from '@medplum/fhirtypes';
import React from 'react';

export interface MoneyDisplayProps {
  value?: Money;
}

export function MoneyDisplay(props: MoneyDisplayProps): JSX.Element | null {
  return <>{formatMoney(props.value)}</>;
}
