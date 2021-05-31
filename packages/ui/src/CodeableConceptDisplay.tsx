import { CodeableConcept } from '@medplum/core';
import React from 'react';

export interface CodeableConceptInputProps {
  value?: CodeableConcept;
}

export function CodeableConceptDisplay(props: CodeableConceptInputProps) {
  const value = props.value;
  return (
    <div>
      {JSON.stringify(value)}
    </div>
  );
}
