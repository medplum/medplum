import { formatCoding } from '@medplum/core';
import { Coding } from '@medplum/fhirtypes';

export interface CodingDisplayProps {
  readonly value?: Coding;
}

export function CodingDisplay(props: CodingDisplayProps): JSX.Element {
  return <>{formatCoding(props.value)}</>;
}
