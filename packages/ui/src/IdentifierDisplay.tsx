import { Identifier } from '@medplum/core';
import React from 'react';

export interface IdentifierDisplayProps {
  value?: Identifier;
}

export function IdentifierDisplay(props: IdentifierDisplayProps) {
  return (
    <div style={{ marginBottom: 16 }}>
      {props.value?.system}
      <br />
      {props.value?.value}
    </div>
  );
}
