import { formatRangeString } from '@medplum/core';
import { Range } from '@medplum/fhirtypes';
import React from 'react';

export interface RangeDisplayProps {
  value?: Range;
}

export function RangeDisplay(props: RangeDisplayProps): JSX.Element | null {
  return <>{formatRangeString(props.value)}</>;
}
