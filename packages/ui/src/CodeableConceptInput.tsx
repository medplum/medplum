import { CodeableConcept, stringify } from '@medplum/core';
import React from 'react';

export interface CodeableConceptInputProps {
  name: string;
  defaultValue?: CodeableConcept;
}

export function CodeableConceptInput(props: CodeableConceptInputProps) {
  return (
    <textarea
      data-testid="codeable-concept-input"
      name={props.name}
      defaultValue={stringify(props.defaultValue)}
    />
  );
}
