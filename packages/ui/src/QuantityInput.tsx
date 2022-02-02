import { Quantity } from '@medplum/fhirtypes';
import React, { useState } from 'react';
import { Input } from './Input';
import { InputRow } from './InputRow';

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
      <Input
        name={props.name}
        type="number"
        step={0.01}
        placeholder="Value"
        defaultValue={value?.value?.toString()}
        onChange={(newValue) =>
          setValueWrapper({
            ...value,
            value: tryParseNumber(newValue),
          })
        }
      />
      <Input
        placeholder="Unit"
        defaultValue={value?.unit}
        onChange={(newValue) =>
          setValueWrapper({
            ...value,
            unit: newValue,
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
