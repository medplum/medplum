// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import type { ValueSetExpansionContains } from '@medplum/fhirtypes';
import type { JSX } from 'react';
import { useMemo, useState } from 'react';
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
  // A controlled `value` is only a code, so keep the picked element to show its display.
  const [picked, setPicked] = useState<ValueSetExpansionContains>();
  const controlledValue = useMemo(() => {
    if (value === undefined) {
      return undefined;
    }
    return picked?.code && picked.code === value ? picked : (codeToValueSetElement(value) ?? null);
  }, [value, picked]);

  function handleChange(newValues: ValueSetExpansionContains[]): void {
    setPicked(newValues[0]);
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
