import { formatHumanName, HumanName, HumanNameFormatOptions } from '@medplum/core';
import React from 'react';

export interface HumanNameDisplayProps {
  value?: HumanName;
  options?: HumanNameFormatOptions;
}

export function HumanNameDisplay(props: HumanNameDisplayProps) {
  const name = props.value;
  if (!name) {
    return null;
  }

  return <>{formatHumanName(name, props.options)}</>
}
