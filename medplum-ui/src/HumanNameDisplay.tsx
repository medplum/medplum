import { HumanName } from 'medplum';
import React from 'react';

export interface HumanNameDisplayProps {
  value?: HumanName;
}

export function HumanNameDisplay(props: HumanNameDisplayProps) {
  const name = props.value;
  if (!name) {
    return null;
  }

  const builder = [];

  if (name.prefix) {
    builder.push(...name.prefix);
  }

  if (name.given) {
    builder.push(...name.given);
  }

  if (name.family) {
    builder.push(name.family);
  }

  if (name.suffix) {
    builder.push(...name.suffix);
  }

  if (name.use) {
    builder.push('[' + name.use + ']');
  }

  return <>{builder.join(' ').trim()}</>;
}
