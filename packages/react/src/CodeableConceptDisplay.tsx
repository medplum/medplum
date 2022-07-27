import { CodeableConcept } from '@medplum/fhirtypes';
import React from 'react';
import { CodingDisplay } from './CodingDisplay';

export interface CodeableConceptDisplayProps {
  value?: CodeableConcept;
}

export function CodeableConceptDisplay(props: CodeableConceptDisplayProps): JSX.Element | null {
  const value = props.value;
  if (!value) {
    return null;
  }

  if (value.text) {
    return <>{value.text}</>;
  }

  if (value.coding) {
    return (
      <>
        {value.coding.map((coding, index) => (
          <React.Fragment key={'coding-' + index}>
            {index > 0 && <>{', '}</>}
            <CodingDisplay value={coding} />
          </React.Fragment>
        ))}
      </>
    );
  }

  return null;
}
