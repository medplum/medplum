import { Group, NativeSelect, TextInput } from '@mantine/core';
import { Quantity } from '@medplum/fhirtypes';
import { useContext, useMemo, useState, WheelEvent } from 'react';
import { ComplexTypeInputProps } from '../ResourcePropertyInput/ResourcePropertyInput.utils';
import { ElementsContext } from '../ElementsInput/ElementsInput.utils';

export interface QuantityInputProps extends ComplexTypeInputProps<Quantity> {
  readonly autoFocus?: boolean;
  readonly required?: boolean;
  readonly disableWheel?: boolean;
}

export function QuantityInput(props: QuantityInputProps): JSX.Element {
  const [value, setValue] = useState(props.defaultValue);
  const { getExtendedProps } = useContext(ElementsContext);
  const [comparatorProps, valueProps, unitProps] = useMemo(
    () => ['comparator', 'value', 'unit'].map((field) => getExtendedProps(props.path + '.' + field)),
    [getExtendedProps, props.path]
  );

  function setValueWrapper(newValue: Quantity): void {
    setValue(newValue);
    if (props.onChange) {
      props.onChange(newValue);
    }
  }

  return (
    <Group gap="xs" grow wrap="nowrap">
      <NativeSelect
        disabled={props.disabled || comparatorProps?.readonly}
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
        disabled={props.disabled || valueProps?.readonly}
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
        disabled={props.disabled || unitProps?.readonly}
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
