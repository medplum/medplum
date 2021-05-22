import { PropertySchema } from 'medplum';
import React from 'react';

export interface BackboneElementDisplayProps {
  property: PropertySchema;
  value?: any;
}

export function BackboneElementDisplay(props: BackboneElementDisplayProps) {
  return (
    <div>{JSON.stringify(props.value)}</div>
  );
}
