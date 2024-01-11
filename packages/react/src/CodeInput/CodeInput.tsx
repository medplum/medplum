import { ValueSetExpansionContains } from '@medplum/fhirtypes';
import { useState } from 'react';
import { ValueSetAutocomplete, ValueSetAutocompleteProps } from '../ValueSetAutocomplete/ValueSetAutocomplete';

export interface CodeInputProps extends Omit<ValueSetAutocompleteProps, 'defaultValue' | 'onChange'> {
  defaultValue?: string;
  onChange?: (value: string | undefined) => void;
}

export function CodeInput(props: CodeInputProps): JSX.Element {
  const { defaultValue, onChange, ...rest } = props;
  const [value, setValue] = useState<string | undefined>(defaultValue);

  function handleChange(newValues: ValueSetExpansionContains[]): void {
    const newValue = newValues[0];
    const newCode = valueSetElementToCode(newValue);
    setValue(newCode);
    if (onChange) {
      onChange(newCode);
    }
  }

  return <ValueSetAutocomplete defaultValue={codeToValueSetElement(value)} onChange={handleChange} {...rest} />;
}

function codeToValueSetElement(code: string | undefined): ValueSetExpansionContains | undefined {
  return code ? { code } : undefined;
}

function valueSetElementToCode(element: ValueSetExpansionContains | undefined): string | undefined {
  return element?.code;
}
