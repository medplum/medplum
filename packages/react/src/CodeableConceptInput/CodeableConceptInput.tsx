// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import type { CodeableConcept, ValueSetExpansionContains } from '@medplum/fhirtypes';
import type { JSX } from 'react';
import type { ComplexTypeInputProps } from '../ResourcePropertyInput/ResourcePropertyInput.utils';
import type { ValueSetAutocompleteProps } from '../ValueSetAutocomplete/ValueSetAutocomplete';
import { ValueSetAutocomplete } from '../ValueSetAutocomplete/ValueSetAutocomplete';

export interface CodeableConceptInputProps
  extends
    Omit<ValueSetAutocompleteProps, 'name' | 'defaultValue' | 'value' | 'onChange' | 'disabled'>,
    ComplexTypeInputProps<CodeableConcept> {
  /** Passing this (`null` for none) makes the input controlled; see `AsyncAutocompleteProps.value`. */
  readonly value?: CodeableConcept | null;
  readonly onChange?: (value: CodeableConcept | undefined) => void;
}

export function CodeableConceptInput(props: CodeableConceptInputProps): JSX.Element {
  const {
    defaultValue,
    value,
    onChange,
    withHelpText,
    // spread these unused props so they don't get passed to ValueSetAutocomplete in `rest`
    outcome: _outcome,
    path: _path,
    valuePath: _valuePath,
    ...rest
  } = props;

  function handleChange(newValues: ValueSetExpansionContains[]): void {
    if (onChange) {
      onChange(valueSetElementToCodeableConcept(newValues));
    }
  }

  return (
    <ValueSetAutocomplete
      defaultValue={defaultValue && codeableConceptToValueSetElement(defaultValue)}
      value={value === undefined ? undefined : ((value && codeableConceptToValueSetElement(value)) ?? null)}
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
