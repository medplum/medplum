import { HumanName } from '@medplum/core';
import React from 'react';
import { formatHumanName, HumanNameFormatOptions } from './HumanNameUtils';

export interface HumanNameDisplayProps {
  value?: HumanName;
  options?: HumanNameFormatOptions;
}

export function HumanNameDisplay(props: HumanNameDisplayProps) {
  const name = props.value;
  if (!name) {
    return null;
  }

  return <>{formatHumanName(name, props.options || { all: true })}</>
}
