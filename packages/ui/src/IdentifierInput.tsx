import { Identifier } from '@medplum/fhirtypes';
import React, { useState } from 'react';
import { Input } from './Input';
import { InputRow } from './InputRow';

export interface IdentifierInputProps {
  name: string;
  defaultValue?: Identifier;
  onChange?: (value: Identifier) => void;
}

export function IdentifierInput(props: IdentifierInputProps): JSX.Element {
  const [value, setValue] = useState(props.defaultValue);

  function setValueWrapper(newValue: Identifier): void {
    setValue(newValue);
    if (props.onChange) {
      props.onChange(newValue);
    }
  }

  return (
    <InputRow>
      <Input
        placeholder="System"
        defaultValue={value?.system}
        onChange={(newValue) => setValueWrapper({ ...value, system: newValue })}
      />
      <Input
        placeholder="Value"
        defaultValue={value?.value}
        onChange={(newValue) => setValueWrapper({ ...value, value: newValue })}
      />
    </InputRow>
  );
}
