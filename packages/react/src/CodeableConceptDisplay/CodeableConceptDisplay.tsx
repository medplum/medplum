import { formatCodeableConcept } from '@medplum/core';
import { CodeableConcept } from '@medplum/fhirtypes';
import React from 'react';

export interface CodeableConceptDisplayProps {
  value?: CodeableConcept;
}

export function CodeableConceptDisplay(props: CodeableConceptDisplayProps): JSX.Element {
  return <>{formatCodeableConcept(props.value)}</>;
}
