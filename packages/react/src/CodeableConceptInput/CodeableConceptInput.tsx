import { CodeableConcept, ValueSetExpansionContains } from '@medplum/fhirtypes';
import React, { useState } from 'react';
import { ValueSetAutocomplete } from '../ValueSetAutocomplete/ValueSetAutocomplete';

export interface CodeableConceptInputProps {
  binding: string | undefined;
  name: string;
  placeholder?: string;
  defaultValue?: CodeableConcept;
  onChange?: (value: CodeableConcept | undefined) => void;
}

export function CodeableConceptInput(props: CodeableConceptInputProps): JSX.Element {
  const [value, setValue] = useState<CodeableConcept | undefined>(props.defaultValue);

  function handleChange(newValues: ValueSetExpansionContains[]): void {
    const newConcept = valueSetElementToCodeableConcept(newValues);
    setValue(newConcept);
    if (props.onChange) {
      props.onChange(newConcept);
    }
  }

  return (
    <ValueSetAutocomplete
      binding={props.binding}
      name={props.name}
      placeholder={props.placeholder}
      defaultValue={value && codeableConceptToValueSetElement(value)}
      maxSelectedValues={1}
      onChange={handleChange}
    />
  );
}

function codeableConceptToValueSetElement(concept: CodeableConcept): ValueSetExpansionContains[] | undefined {
  return concept.coding?.map((c) => ({
    system: c.system,
    code: c.code,
    display: c.display,
  }));
}

function valueSetElementToCodeableConcept(elements: ValueSetExpansionContains[]): CodeableConcept | undefined {
  if (elements.length === 0) {
    return undefined;
  }
  return {
    coding: elements.map((e) => ({
      system: e.system,
      code: e.code,
      display: e.display,
    })),
  };
}
