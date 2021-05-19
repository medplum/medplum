import { Reference } from 'medplum';
import React from 'react';

export interface ReferenceDisplayProps {
  value?: Reference;
}

export function ReferenceDisplay(props: ReferenceDisplayProps) {
  return (
    <div>{JSON.stringify(props.value)}</div>
  );
}
