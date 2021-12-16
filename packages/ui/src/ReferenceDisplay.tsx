import { stringify } from '@medplum/core';
import { Reference } from '@medplum/fhirtypes';
import React from 'react';
import { MedplumLink } from './MedplumLink';

export interface ReferenceDisplayProps {
  value?: Reference;
}

export function ReferenceDisplay(props: ReferenceDisplayProps) {
  if (!props.value) {
    return null;
  }
  if (props.value.reference && props.value.display) {
    return (
      <MedplumLink to={props.value}>{props.value.display}</MedplumLink>
    );
  }
  if (props.value.reference) {
    return (
      <MedplumLink to={props.value}>{props.value.reference}</MedplumLink>
    );
  }
  return (
    <div>{stringify(props.value)}</div>
  );
}
