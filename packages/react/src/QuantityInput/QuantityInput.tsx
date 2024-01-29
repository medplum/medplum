import { Group, NativeSelect, TextInput } from '@mantine/core';
import { Quantity } from '@medplum/fhirtypes';
import { useState, WheelEvent } from 'react';

export interface QuantityInputProps {
  readonly name: string;
  readonly defaultValue?: Quantity;
  readonly autoFocus?: boolean;
  readonly required?: boolean;
  readonly onChange?: (value: Quantity) => void;
  readonly disableWheel?: boolean;
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
    <Group gap="xs" grow wrap="nowrap">
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
        required={props.required}
        data-autofocus={props.autoFocus}
        data-testid={props.name + '-value'}
        type="number"
        placeholder="Value"
        defaultValue={value?.value}
        autoFocus={props.autoFocus}
        step="any"
        onWheel={(e: WheelEvent<HTMLInputElement>) => {
          if (props.disableWheel) {
            e.currentTarget.blur();
          }
        }}
        onChange={(e) => {
          setValueWrapper({
            ...value,
            value: tryParseNumber(e.currentTarget.value),
          });
        }}
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
