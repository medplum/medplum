import { Identifier } from '@medplum/fhirtypes';
import React from 'react';

export interface IdentifierDisplayProps {
  value?: Identifier;
}

export function IdentifierDisplay(props: IdentifierDisplayProps) {
  return (
    <div>
      {props.value?.system}: {props.value?.value}
    </div>
  );
}
