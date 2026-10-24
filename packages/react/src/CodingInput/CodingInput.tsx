// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import type { Coding, QuestionnaireResponseItem, ValueSetExpansionContains } from '@medplum/fhirtypes';
import type { JSX } from 'react';
import type { ComplexTypeInputProps } from '../ResourcePropertyInput/ResourcePropertyInput.utils';
import type { ValueSetAutocompleteProps } from '../ValueSetAutocomplete/ValueSetAutocomplete';
import { ValueSetAutocomplete } from '../ValueSetAutocomplete/ValueSetAutocomplete';

export interface CodingInputProps
  extends
    Omit<ValueSetAutocompleteProps, 'defaultValue' | 'value' | 'onChange' | 'disabled' | 'name'>,
    ComplexTypeInputProps<Coding> {
  /** Passing this (`null` for none) makes the input controlled; see `AsyncAutocompleteProps.value`. */
  readonly value?: Coding | null;
  readonly response?: QuestionnaireResponseItem;
}

export function CodingInput(props: CodingInputProps): JSX.Element {
  const { defaultValue, value, onChange, withHelpText, response, ...rest } = props;
  const initialValue = response?.answer?.[0]?.valueCoding ?? defaultValue;

  function handleChange(newValues: ValueSetExpansionContains[]): void {
    const newValue = newValues[0];
    if (onChange) {
      onChange(newValue && valueSetElementToCoding(newValue));
    }
  }

  return (
    <ValueSetAutocomplete
      defaultValue={initialValue ? codingToValueSetElement(initialValue) : undefined}
      value={value === undefined ? undefined : value && codingToValueSetElement(value)}
      maxValues={1}
      onChange={handleChange}
      withHelpText={withHelpText ?? true}
      {...rest}
    />
  );
}

export function codingToValueSetElement(coding: Coding): ValueSetExpansionContains {
  return {
    system: coding.system,
    code: coding.code,
    display: coding.display,
  };
}

export function valueSetElementToCoding(element: ValueSetExpansionContains): Coding {
  return {
    system: element.system,
    code: element.code,
    display: element.display,
  };
}
