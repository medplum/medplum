import { ElementDefinition, stringify } from '@medplum/core';
import React from 'react';

export interface BackboneElementDisplayProps {
  property: ElementDefinition;
  value?: any;
}

export function BackboneElementDisplay(props: BackboneElementDisplayProps) {
  return (
    <div>{stringify(props.value)}</div>
  );
}
