import React from 'react';

export interface EnumInputProps {
  name: string;
  label: string;
  value?: string;
  options?: any[];
  helperText?: string;
}

export function EnumInput(props: EnumInputProps) {
  return (
    <select name={props.name} defaultValue={props.value}>
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
