import { CodeableConcept } from '@medplum/fhirtypes';
import React from 'react';
import { CodingDisplay } from './CodingDisplay';

export interface CodeableConceptInputProps {
  value?: CodeableConcept;
}

export function CodeableConceptDisplay(props: CodeableConceptInputProps) {
  const value = props.value;
  if (!value) {
    return null;
  }

  if (value.text) {
    return <>{value.text}</>;
  }

  if (value.coding && value.coding.length > 0) {
    return <CodingDisplay value={value.coding[0]} />;
  }

  return null;
}
