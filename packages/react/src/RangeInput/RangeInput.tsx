import { Group } from '@mantine/core';
import { Range } from '@medplum/fhirtypes';
import { useContext, useMemo, useState } from 'react';
import { QuantityInput } from '../QuantityInput/QuantityInput';
import { ElementsContext } from '../ElementsInput/ElementsInput.utils';
import { ComplexTypeInputProps } from '../ResourcePropertyInput/ResourcePropertyInput.utils';

export interface RangeInputProps extends ComplexTypeInputProps<Range> {}

/**
 * Renders a Range input.
 * See: https://www.hl7.org/fhir/datatypes.html#Range
 * @param props - Range input properties.
 * @returns Range input element.
 */
export function RangeInput(props: RangeInputProps): JSX.Element {
  const [value, setValue] = useState(props.defaultValue);
  const { getExtendedProps } = useContext(ElementsContext);
  const [lowProps, highProps] = useMemo(
    () => ['low', 'high'].map((field) => getExtendedProps(props.path + '.' + field)),
    [getExtendedProps, props.path]
  );

  function setValueWrapper(newValue: Range): void {
    setValue(newValue);
    if (props.onChange) {
      props.onChange(newValue);
    }
  }

  return (
    <Group gap="xs" grow wrap="nowrap">
      <QuantityInput
        path={props.path + '.low'}
        disabled={props.disabled || lowProps?.readonly}
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
        path={props.path + '.high'}
        disabled={props.disabled || highProps?.readonly}
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
