import { CodeableConcept, ElementDefinition, ValueSetExpansionContains } from '@medplum/fhirtypes';
import React, { useState } from 'react';
import { ValueSetAutocomplete } from '../ValueSetAutocomplete/ValueSetAutocomplete';

export interface CodeableConceptInputProps {
  property: ElementDefinition;
  name: string;
  placeholder?: string;
  defaultValue?: CodeableConcept;
  onChange?: (value: CodeableConcept | undefined) => void;
}

export function CodeableConceptInput(props: CodeableConceptInputProps): JSX.Element {
  const [value, setValue] = useState<CodeableConcept | undefined>(props.defaultValue);

  function handleChange(newValue: ValueSetExpansionContains | undefined): void {
    const newConcept = newValue && valueSetElementToCodeableConcept(newValue);
    setValue(newConcept);
    if (props.onChange) {
      props.onChange(newConcept);
    }
  }

  return (
    <ValueSetAutocomplete
      property={props.property}
      name={props.name}
      placeholder={props.placeholder}
      defaultValue={value && codeableConceptToValueSetElement(value)}
      onChange={handleChange}
    />
  );
}

function codeableConceptToValueSetElement(concept: CodeableConcept): ValueSetExpansionContains {
  return {
    system: concept.coding?.[0]?.system,
    code: concept.coding?.[0]?.code,
    display: concept.coding?.[0]?.display,
  };
}

function valueSetElementToCodeableConcept(element: ValueSetExpansionContains): CodeableConcept {
  return {
    text: element.display,
    coding: [
      {
        system: element.system,
        code: element.code,
        display: element.display,
      },
    ],
  };
}
