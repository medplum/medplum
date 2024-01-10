import { CodeableConcept, ValueSetExpansionContains } from '@medplum/fhirtypes';
import { useState } from 'react';
import { ValueSetAutocomplete, ValueSetAutocompleteProps } from '../ValueSetAutocomplete/ValueSetAutocomplete';

export interface CodeableConceptInputProps extends Omit<ValueSetAutocompleteProps, 'defaultValue' | 'onChange'> {
  defaultValue?: CodeableConcept;
  onChange?: (value: CodeableConcept | undefined) => void;
}

export function CodeableConceptInput(props: CodeableConceptInputProps): JSX.Element {
  const handleChange = useCallback(
    (newValues: ValueSetExpansionContains[]): void => {
      const newConcept = valueSetElementToCodeableConcept(newValues);
      setValue(newConcept);
      if (onChange) {
        onChange(newConcept);
      }
    },
    [onChange]
  );

  return (
    <ValueSetAutocomplete
      defaultValue={value && codeableConceptToValueSetElement(value)}
      onChange={handleChange}
      {...rest}
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
