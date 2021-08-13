import { ElementDefinition } from '@medplum/core';
import React from 'react';

export interface EnumInputProps {
  property: ElementDefinition;
  name: string;
  value: string;
}

export function EnumInput(props: EnumInputProps) {
  const options = props.property.short?.split(' | ');
  return (
    <select data-testid="enum-input" name={props.name} defaultValue={props.value}>
      <option></option>
      {options && options.map(v => (
        <option key={v} value={v}>{v}</option>
      ))}
    </select>
  );
}
