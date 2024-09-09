import { formatCodeableConcept } from '@medplum/core';
import { CodeableConcept } from '@medplum/fhirtypes';

export interface CodeableConceptDisplayProps {
  readonly value?: CodeableConcept;
}

export function CodeableConceptDisplay(props: CodeableConceptDisplayProps): JSX.Element {
  return <>{formatCodeableConcept(props.value)}</>;
}
