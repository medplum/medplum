import { CodeableConcept } from '@medplum/core';
import React from 'react';

export interface CodeableConceptInputProps {
  value?: CodeableConcept;
}

export function CodeableConceptDisplay(props: CodeableConceptInputProps) {
  const value = props.value;
  if (!value) {
    return null;
  }

  const text = value.text ?? value.coding?.[0]?.display ?? value.coding?.[0]?.code;
  return (
    <>
      {text}
    </>
  );
}
