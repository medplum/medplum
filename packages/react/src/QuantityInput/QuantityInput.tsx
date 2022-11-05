import { Group, NativeSelect, TextInput } from '@mantine/core';
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
        data-testid={props.name + '-comparator'}
        defaultValue={value?.comparator}
        data={['', '<', '<=', '>=', '>']}
        onChange={(e) =>
          setValueWrapper({
            ...value,
            comparator: e.currentTarget.value as '<' | '<=' | '>=' | '>',
          })
        }
      />
      <TextInput
        id={props.name}
        name={props.name}
        data-testid={props.name + '-value'}
        type="number"
        step="any"
        placeholder="Value"
        defaultValue={value?.value?.toString()}
        onChange={(e) =>
          setValueWrapper({
            ...value,
            value: tryParseNumber(e.currentTarget.value),
          })
        }
      />
      <TextInput
        placeholder="Unit"
        data-testid={props.name + '-unit'}
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

function tryParseNumber(str: string): number | undefined {
  if (!str) {
    return undefined;
  }
  return parseFloat(str);
}
