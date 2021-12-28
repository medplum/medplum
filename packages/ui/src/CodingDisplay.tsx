import { Coding } from '@medplum/fhirtypes';
import React from 'react';

export interface CodingDisplayProps {
  value?: Coding;
}

export function CodingDisplay(props: CodingDisplayProps) {
  return <>{props.value?.display || props.value?.code}</>;
}
