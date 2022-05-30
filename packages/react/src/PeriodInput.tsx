import { Period } from '@medplum/fhirtypes';
import React, { useState } from 'react';
import { Input } from './Input';
import { InputRow } from './InputRow';

export interface PeriodInputProps {
  name: string;
  defaultValue?: Period;
  onChange?: (value: Period) => void;
}

export function PeriodInput(props: PeriodInputProps): JSX.Element {
  const [value, setValue] = useState(props.defaultValue);

  function setValueWrapper(newValue: Period): void {
    setValue(newValue);
    if (props.onChange) {
      props.onChange(newValue);
    }
  }

  return (
    <InputRow>
      <Input
        type="datetime-local"
        placeholder="Start"
        defaultValue={value?.start}
        onChange={(newValue) => setValueWrapper({ ...value, start: newValue })}
      />
      <Input
        type="datetime-local"
        placeholder="End"
        defaultValue={value?.end}
        onChange={(newValue) => setValueWrapper({ ...value, end: newValue })}
      />
    </InputRow>
  );
}
