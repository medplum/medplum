import { TypeDefinition } from 'medplum';
import React from 'react';

export interface BackboneElementDisplayProps {
  backboneType: TypeDefinition;
  value?: any;
}

export function BackboneElementDisplay(props: BackboneElementDisplayProps) {
  return (
    <div>{JSON.stringify(props.value)}</div>
  );
}
