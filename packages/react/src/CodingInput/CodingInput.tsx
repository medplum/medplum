import { Coding, ValueSetExpansionContains } from '@medplum/fhirtypes';
import { useState } from 'react';
import { ValueSetAutocomplete, ValueSetAutocompleteProps } from '../ValueSetAutocomplete/ValueSetAutocomplete';

export interface CodingInputProps extends Omit<ValueSetAutocompleteProps, 'defaultValue' | 'onChange'> {
  defaultValue?: Coding;
  onChange?: (value: Coding | undefined) => void;
}

export function CodingInput(props: CodingInputProps): JSX.Element {
  const { defaultValue, onChange, ...rest } = props;
  const [value, setValue] = useState<Coding | undefined>(defaultValue);

  function handleChange(newValues: ValueSetExpansionContains[]): void {
    const newValue = newValues[0];
    const newConcept = newValue && valueSetElementToCoding(newValue);
    setValue(newConcept);
    if (onChange) {
      onChange(newConcept);
    }
  }

  return (
    <ValueSetAutocomplete
      defaultValue={value && codingToValueSetElement(value)}
      maxValues={1}
      onChange={handleChange}
      {...rest}
    />
  );
}

function codingToValueSetElement(coding: Coding): ValueSetExpansionContains {
  return {
    system: coding.system,
    code: coding.code,
    display: coding.display,
  };
}

function valueSetElementToCoding(element: ValueSetExpansionContains): Coding {
  return {
    system: element.system,
    code: element.code,
    display: element.display,
  };
}
