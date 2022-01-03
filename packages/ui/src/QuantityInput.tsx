import { Quantity } from '@medplum/fhirtypes';
import React, { useState } from 'react';
import { InputRow } from './InputRow';
import { TextField } from './TextField';

export interface QuantityInputProps {
  name: string;
  defaultValue?: Quantity;
  onChange?: (value: Quantity) => void;
}

export function QuantityInput(props: QuantityInputProps): JSX.Element {
  const [value, setValue] = useState(props.defaultValue);

  function setValueWrapper(newValue: Quantity): void {
    setValue(newValue);
    if (props.onChange) {
      props.onChange(newValue);
    }
  }

  return (
    <InputRow>
      <TextField
        name={props.name}
        type="number"
        step={0.01}
        placeholder="Value"
        defaultValue={value?.value?.toString()}
        onChange={(e) =>
          setValueWrapper({
            ...value,
            value: tryParseNumber((e.currentTarget as HTMLInputElement).value),
          })
        }
      />
      <TextField
        placeholder="Unit"
        defaultValue={value?.unit}
        onChange={(e) =>
          setValueWrapper({
            ...value,
            unit: (e.currentTarget as HTMLInputElement).value,
          })
        }
      />
    </InputRow>
  );
}

function tryParseNumber(str: string): number | undefined {
  if (!str) {
    return undefined;
  }
  return parseFloat(str);
}
