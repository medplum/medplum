// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import type { Coding, QuestionnaireResponseItem, ValueSetExpansionContains } from '@medplum/fhirtypes';
import type { JSX } from 'react';
import { useState } from 'react';
import type { ComplexTypeInputProps } from '../ResourcePropertyInput/ResourcePropertyInput.utils';
import type { ValueSetAutocompleteProps } from '../ValueSetAutocomplete/ValueSetAutocomplete';
import { ValueSetAutocomplete } from '../ValueSetAutocomplete/ValueSetAutocomplete';

export interface CodingInputProps
  extends Omit<ValueSetAutocompleteProps, 'defaultValue' | 'onChange' | 'disabled' | 'name'>,
    ComplexTypeInputProps<Coding> {
  readonly response?: QuestionnaireResponseItem;
}

export function CodingInput(props: CodingInputProps): JSX.Element {
  const { defaultValue, onChange, withHelpText, response, ...rest } = props;
  const [value, setValue] = useState<Coding | undefined>(response?.answer?.[0]?.valueCoding ?? defaultValue);

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
      defaultValue={value ? codingToValueSetElement(value) : undefined}
      maxValues={1}
      onChange={handleChange}
      withHelpText={withHelpText ?? true}
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
