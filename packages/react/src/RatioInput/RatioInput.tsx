import { Group } from '@mantine/core';
import { Ratio } from '@medplum/fhirtypes';
import { useContext, useMemo, useState } from 'react';
import { QuantityInput } from '../QuantityInput/QuantityInput';
import { ElementsContext } from '../ElementsInput/ElementsInput.utils';
import { ComplexTypeInputProps } from '../ResourcePropertyInput/ResourcePropertyInput.utils';

export interface RatioInputProps extends ComplexTypeInputProps<Ratio> {}

/**
 * Renders a Ratio input.
 * See: https://www.hl7.org/fhir/datatypes.html#Ratio
 * @param props - Ratio input properties.
 * @returns Ratio input element.
 */
export function RatioInput(props: RatioInputProps): JSX.Element {
  const [value, setValue] = useState(props.defaultValue);
  const { getExtendedProps } = useContext(ElementsContext);
  const [numeratorProps, denominatorProps] = useMemo(
    () => ['numerator', 'denominator'].map((field) => getExtendedProps(props.path + '.' + field)),
    [getExtendedProps, props.path]
  );

  function setValueWrapper(newValue: Ratio): void {
    setValue(newValue);
    if (props.onChange) {
      props.onChange(newValue);
    }
  }

  return (
    <Group gap="xs" grow wrap="nowrap">
      <QuantityInput
        path={props.path + '.numerator'}
        disabled={props.disabled || numeratorProps?.readonly}
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
        path={props.path + '.denominator'}
        disabled={props.disabled || denominatorProps?.readonly}
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
