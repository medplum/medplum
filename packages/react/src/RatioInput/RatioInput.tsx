import { Group } from '@mantine/core';
import { Ratio } from '@medplum/fhirtypes';
import React, { useState } from 'react';
import { QuantityInput } from '../QuantityInput/QuantityInput';

export interface RatioInputProps {
  name: string;
  defaultValue?: Ratio;
  onChange?: (value: Ratio) => void;
}

/**
 * Renders a Ratio input.
 * See: https://www.hl7.org/fhir/datatypes.html#Ratio
 * @param props - Ratio input properties.
 * @returns Ratio input element.
 */
export function RatioInput(props: RatioInputProps): JSX.Element {
  const [value, setValue] = useState(props.defaultValue);

  function setValueWrapper(newValue: Ratio): void {
    setValue(newValue);
    if (props.onChange) {
      props.onChange(newValue);
    }
  }

  return (
    <Group spacing="xs" grow noWrap>
      <QuantityInput
        name={props.name + '-numerator'}
        defaultValue={value?.numerator}
        onChange={(v) =>
          setValueWrapper({
            ...value,
            numerator: v,
          })
        }
      />
      <QuantityInput
        name={props.name + '-denominator'}
        defaultValue={value?.denominator}
        onChange={(v) =>
          setValueWrapper({
            ...value,
            denominator: v,
          })
        }
      />
    </Group>
  );
}
