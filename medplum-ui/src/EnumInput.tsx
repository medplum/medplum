import React from 'react';
import { PropertyDefinition } from 'medplum';

export interface EnumInputProps {
  propertyPrefix: string;
  property: PropertyDefinition;
  label: string;
  value?: string;
  options?: any[];
  helperText?: string;
}

export function EnumInput(props: EnumInputProps) {
  const inputName = props.propertyPrefix + props.property.key;
  return (
    <select name={inputName} defaultValue={props.value}>
      <option></option>
      {props.options && props.options.map(v => {
        if (typeof v === 'string') {
          return <option key={v} value={v}>{v}</option>
        } else {
          return <option key={v.value} value={v.value}>{v.display}</option>
        }
      })}
    </select>
  );
}
