import { CodeableConcept, stringify } from '@medplum/core';
import React from 'react';

export interface CodeableConceptInputProps {
  value?: CodeableConcept;
}

export function CodeableConceptDisplay(props: CodeableConceptInputProps) {
  const value = props.value;
  return (
    <div>
      {stringify(value)}
    </div>
  );
}
