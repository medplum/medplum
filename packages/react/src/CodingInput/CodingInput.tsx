import { Coding, ElementDefinition, ValueSetExpansionContains } from '@medplum/fhirtypes';
import React, { useState } from 'react';
import { ValueSetAutocomplete } from '../ValueSetAutocomplete/ValueSetAutocomplete';

export interface CodingInputProps {
  property: ElementDefinition;
  name: string;
  placeholder?: string;
  defaultValue?: Coding;
  onChange?: (value: Coding | undefined) => void;
}

export function CodingInput(props: CodingInputProps): JSX.Element {
  const [value, setValue] = useState<Coding | undefined>(props.defaultValue);

  function handleChange(newValues: ValueSetExpansionContains[]): void {
    const newValue = newValues[0];
    const newConcept = newValue && valueSetElementToCoding(newValue);
    setValue(newConcept);
    if (props.onChange) {
      props.onChange(newConcept);
    }
  }

  return (
    <ValueSetAutocomplete
      elementDefinition={props.property}
      name={props.name}
      placeholder={props.placeholder}
      defaultValue={value && codingToValueSetElement(value)}
      onChange={handleChange}
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
