import { ValueSetExpansionContains } from '@medplum/fhirtypes';
import React, { useState } from 'react';
import { ValueSetAutocomplete } from '../ValueSetAutocomplete/ValueSetAutocomplete';
import { InternalSchemaElement } from '@medplum/core';

export interface CodeInputProps {
  property: InternalSchemaElement;
  name: string;
  placeholder?: string;
  defaultValue?: string;
  onChange?: (value: string | undefined) => void;
  creatable?: boolean;
  maxSelectedValues?: number;
  clearSearchOnChange?: boolean;
  clearable?: boolean;
}

export function CodeInput(props: CodeInputProps): JSX.Element {
  const [value, setValue] = useState<string | undefined>(props.defaultValue);

  function handleChange(newValues: ValueSetExpansionContains[]): void {
    const newValue = newValues[0];
    const newCode = valueSetElementToCode(newValue);
    setValue(newCode);
    if (props.onChange) {
      props.onChange(newCode);
    }
  }

  return (
    <ValueSetAutocomplete
      binding={props.property.binding}
      name={props.name}
      placeholder={props.placeholder}
      defaultValue={codeToValueSetElement(value)}
      onChange={handleChange}
      creatable={props.creatable}
      maxSelectedValues={props.maxSelectedValues ?? 1}
      clearSearchOnChange={props.clearSearchOnChange}
      clearable={props.clearable}
    />
  );
}

function codeToValueSetElement(code: string | undefined): ValueSetExpansionContains | undefined {
  return code ? { code } : undefined;
}

function valueSetElementToCode(element: ValueSetExpansionContains | undefined): string | undefined {
  return element?.code;
}
