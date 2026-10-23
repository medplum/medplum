// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import type { ValueSetExpansionContains } from '@medplum/fhirtypes';
import type { JSX } from 'react';
import { useMemo } from 'react';
import type { ValueSetAutocompleteProps } from '../ValueSetAutocomplete/ValueSetAutocomplete';
import { ValueSetAutocomplete } from '../ValueSetAutocomplete/ValueSetAutocomplete';

export interface CodeInputProps extends Omit<ValueSetAutocompleteProps, 'defaultValue' | 'value' | 'onChange'> {
  readonly defaultValue?: string;
  /** Passing this (`null` for none) makes the input controlled; see `AsyncAutocompleteProps.value`. */
  readonly value?: string | null;
  readonly onChange: ((value: string | undefined) => void) | undefined;
}

export function CodeInput(props: CodeInputProps): JSX.Element {
  const { defaultValue, value, onChange, withHelpText, ...rest } = props;
  const controlledValue = useMemo(
    () => (value === undefined ? undefined : (codeToValueSetElement(value) ?? null)),
    [value]
  );

  function handleChange(newValues: ValueSetExpansionContains[]): void {
    if (onChange) {
      onChange(valueSetElementToCode(newValues[0]));
    }
  }

  return (
    <ValueSetAutocomplete
      defaultValue={codeToValueSetElement(defaultValue)}
      value={controlledValue}
      onChange={handleChange}
      withHelpText={withHelpText ?? true}
      {...rest}
    />
  );
}

function codeToValueSetElement(code: string | null | undefined): ValueSetExpansionContains | undefined {
  return code ? { code } : undefined;
}

function valueSetElementToCode(element: ValueSetExpansionContains | undefined): string | undefined {
  return element?.code;
}
