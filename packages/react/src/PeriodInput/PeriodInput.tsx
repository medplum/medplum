import { Group } from '@mantine/core';
import { Period } from '@medplum/fhirtypes';
import { useContext, useMemo, useState } from 'react';
import { DateTimeInput } from '../DateTimeInput/DateTimeInput';
import { ElementsContext } from '../ElementsInput/ElementsInput.utils';
import { ComplexTypeInputProps } from '../ResourcePropertyInput/ResourcePropertyInput.utils';

export interface PeriodInputProps extends ComplexTypeInputProps<Period> {}

export function PeriodInput(props: PeriodInputProps): JSX.Element {
  const [value, setValue] = useState(props.defaultValue);
  const { getExtendedProps } = useContext(ElementsContext);
  const [startProps, endProps] = useMemo(
    () => ['start', 'end'].map((field) => getExtendedProps(props.path + '.' + field)),
    [getExtendedProps, props.path]
  );

  function setValueWrapper(newValue: Period): void {
    setValue(newValue);
    if (props.onChange) {
      props.onChange(newValue);
    }
  }

  return (
    <Group gap="xs" grow wrap="nowrap">
      <DateTimeInput
        disabled={props.disabled || startProps?.readonly}
        name={props.name + '.start'}
        placeholder="Start"
        defaultValue={value?.start}
        onChange={(newValue) => setValueWrapper({ ...value, start: newValue })}
      />
      <DateTimeInput
        disabled={props.disabled || endProps?.readonly}
        name={props.name + '.end'}
        placeholder="End"
        defaultValue={value?.end}
        onChange={(newValue) => setValueWrapper({ ...value, end: newValue })}
      />
    </Group>
  );
}
