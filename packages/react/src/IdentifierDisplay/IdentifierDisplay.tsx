import { Identifier } from '@medplum/fhirtypes';
import { JSX } from 'react';

export interface IdentifierDisplayProps {
  readonly value?: Identifier;
}

export function IdentifierDisplay(props: IdentifierDisplayProps): JSX.Element {
  return (
    <div>
      {props.value?.system}: {props.value?.value}
    </div>
  );
}
