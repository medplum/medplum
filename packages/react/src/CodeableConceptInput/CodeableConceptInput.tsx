import { CodeableConcept, ValueSetExpansionContains } from '@medplum/fhirtypes';
import { useState } from 'react';
import { ComplexTypeInputProps } from '../ResourcePropertyInput/ResourcePropertyInput.utils';
import { ValueSetAutocomplete, ValueSetAutocompleteProps } from '../ValueSetAutocomplete/ValueSetAutocomplete';

export interface CodeableConceptInputProps
  extends Omit<ValueSetAutocompleteProps, 'name' | 'defaultValue' | 'onChange' | 'disabled'>,
    ComplexTypeInputProps<CodeableConcept> {
  readonly onChange?: (value: CodeableConcept | undefined) => void;
}

export function CodeableConceptInput(props: CodeableConceptInputProps): JSX.Element {
  const {
    defaultValue,
    onChange,
    withHelpText,
    // spread these unused props so they don't get passed to ValueSetAutocomplete in `rest`
    outcome: _outcome,
    path: _path,
    valuePath: _valuePath,
    ...rest
  } = props;
  const [value, setValue] = useState<CodeableConcept | undefined>(defaultValue);

  function handleChange(newValues: ValueSetExpansionContains[]): void {
    const newConcept = valueSetElementToCodeableConcept(newValues);
    setValue(newConcept);
    if (onChange) {
      onChange(newConcept);
    }
  }

  return (
    <ValueSetAutocomplete
      defaultValue={value && codeableConceptToValueSetElement(value)}
      onChange={handleChange}
      withHelpText={withHelpText ?? true}
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
