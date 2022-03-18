import { Reference, SearchParameter } from '@medplum/fhirtypes';
import React from 'react';
import { Input } from './Input';
import { ReferenceInput } from './ReferenceInput';

export interface SearchFilterValueInputProps {
  searchParam: SearchParameter;
  defaultValue?: string;
  onChange: (value: string) => void;
}

export function SearchFilterValueInput(props: SearchFilterValueInputProps): JSX.Element | null {
  if (props.searchParam.type === 'reference') {
    return (
      <ReferenceInput
        name="reference"
        defaultValue={{ reference: props.defaultValue }}
        targetTypes={props.searchParam?.target}
        onChange={(newReference: Reference | undefined) => {
          if (newReference) {
            props.onChange(newReference.reference as string);
          } else {
            props.onChange('');
          }
        }}
      />
    );
  }

  const inputTypes: Record<string, React.HTMLInputTypeAttribute> = {
    numeric: 'number',
    date: 'date',
    datetime: 'datetime-local',
  };

  const inputType = inputTypes[props.searchParam.type as string] ?? 'text';
  return <Input testid="filter-value" type={inputType} defaultValue={props.defaultValue} onChange={props.onChange} />;
}
