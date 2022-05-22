import { Quantity } from '@medplum/fhirtypes';
import React, { useState } from 'react';
import { Input } from './Input';
import { InputRow } from './InputRow';
import { Select } from './Select';

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
      <Select
        style={{ width: 80 }}
        testid={props.name + '-comparator'}
        defaultValue={value?.comparator}
        onChange={(newValue) =>
          setValueWrapper({
            ...value,
            comparator: newValue,
          })
        }
      >
        <option></option>
        <option>&lt;</option>
        <option>&lt;=</option>
        <option>&gt;=</option>
        <option>&gt;</option>
      </Select>
      <Input
        name={props.name}
        type="number"
        step="any"
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
