import { PatientLink } from '@medplum/core';
import React from 'react';

export interface PatientLinkDisplayProps {
  value?: PatientLink;
}

export function PatientLinkDisplay(props: PatientLinkDisplayProps) {
  return (
    <div>{JSON.stringify(props.value)}</div>
  );
}
