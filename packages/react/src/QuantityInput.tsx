import { Group, NativeSelect, NumberInput, TextInput } from '@mantine/core';
import { Quantity } from '@medplum/fhirtypes';
import React, { useState } from 'react';

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
    <Group spacing="xs" grow noWrap>
      <NativeSelect
        style={{ width: 80 }}
        defaultValue={value?.comparator}
        onChange={(e) =>
          setValueWrapper({
            ...value,
            comparator: e.currentTarget.value as '<' | '<=' | '>=' | '>',
          })
        }
        data={['<', '<=', '>=', '>']}
      />
      <NumberInput
        name={props.name}
        placeholder="Value"
        defaultValue={value?.value}
        onChange={(newValue) =>
          setValueWrapper({
            ...value,
            value: newValue,
          })
        }
      />
      <TextInput
        placeholder="Unit"
        defaultValue={value?.unit}
        onChange={(e) =>
          setValueWrapper({
            ...value,
            unit: e.currentTarget.value,
          })
        }
      />
    </Group>
  );
}
