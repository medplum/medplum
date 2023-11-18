import { Group } from '@mantine/core';
import { Range } from '@medplum/fhirtypes';
import { useState } from 'react';
import { QuantityInput } from '../QuantityInput/QuantityInput';

export interface RangeInputProps {
  name: string;
  defaultValue?: Range;
  onChange?: (value: Range) => void;
}

/**
 * Renders a Range input.
 * See: https://www.hl7.org/fhir/datatypes.html#Range
 * @param props - Range input properties.
 * @returns Range input element.
 */
export function RangeInput(props: RangeInputProps): JSX.Element {
  const [value, setValue] = useState(props.defaultValue);

  function setValueWrapper(newValue: Range): void {
    setValue(newValue);
    if (props.onChange) {
      props.onChange(newValue);
    }
  }

  return (
    <Group spacing="xs" grow noWrap>
      <QuantityInput
        name={props.name + '-low'}
        defaultValue={value?.low}
        onChange={(v) =>
          setValueWrapper({
            ...value,
            low: v,
          })
        }
      />

      <QuantityInput
        name={props.name + '-high'}
        defaultValue={value?.high}
        onChange={(v) =>
          setValueWrapper({
            ...value,
            high: v,
          })
        }
      />
    </Group>
  );
}
