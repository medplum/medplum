import { Identifier, PropertyDefinition } from 'medplum';
import React from 'react';

export interface IdentifierDisplayProps {
  propertyPrefix: string;
  property: PropertyDefinition;
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
