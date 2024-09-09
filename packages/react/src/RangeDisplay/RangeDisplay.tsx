import { formatRange } from '@medplum/core';
import { Range } from '@medplum/fhirtypes';

export interface RangeDisplayProps {
  readonly value?: Range;
}

export function RangeDisplay(props: RangeDisplayProps): JSX.Element | null {
  return <>{formatRange(props.value)}</>;
}
