import { Period } from '@medplum/fhirtypes';
import React, { useState } from 'react';
import { InputRow } from './InputRow';
import { TextField } from './TextField';

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
      <TextField
        type="datetime-local"
        placeholder="Start"
        defaultValue={value?.start}
        onChange={(e) =>
          setValueWrapper({
            ...value,
            start: (e.currentTarget as HTMLInputElement).value,
          })
        }
      />
      <TextField
        type="datetime-local"
        placeholder="End"
        defaultValue={value?.end}
        onChange={(e) =>
          setValueWrapper({
            ...value,
            end: (e.currentTarget as HTMLInputElement).value,
          })
        }
      />
    </InputRow>
  );
}
