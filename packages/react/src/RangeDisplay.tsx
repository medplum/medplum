import { Range } from '@medplum/fhirtypes';
import React from 'react';
import { formatQuantityString } from './QuantityDisplay';

export interface RangeDisplayProps {
  value?: Range;
}

export function RangeDisplay(props: RangeDisplayProps): JSX.Element | null {
  return <>{formatRangeString(props.value)}</>;
}

export function formatRangeString(range: Range | undefined): string {
  if (!range || (!range.low && !range.high)) {
    return '';
  }

  if (range.low && !range.high) {
    return `>= ${formatQuantityString(range.low)}`;
  }

  if (!range.low && range.high) {
    return `<= ${formatQuantityString(range.high)}`;
  }

  return `${formatQuantityString(range.low)} - ${formatQuantityString(range.high)}`;
}
