import { Group } from '@mantine/core';
import { Period } from '@medplum/fhirtypes';
import { useState } from 'react';
import { DateTimeInput } from '../DateTimeInput/DateTimeInput';

export interface PeriodInputProps {
  name: string;
  defaultValue?: Period;
  onChange?: (value: Period) => void;
}

export function PeriodInput(props: PeriodInputProps): JSX.Element {
  const [value, setValue] = useState(props.defaultValue);

  function setValueWrapper(newValue: Period): void {
    setValue(newValue);
    if (props.onChange) {
      props.onChange(newValue);
    }
  }

  return (
    <Group spacing="xs" grow noWrap>
      <DateTimeInput
        name={props.name + '.start'}
        placeholder="Start"
        defaultValue={value?.start}
        onChange={(newValue) => setValueWrapper({ ...value, start: newValue })}
      />
      <DateTimeInput
        name={props.name + '.end'}
        placeholder="End"
        defaultValue={value?.end}
        onChange={(newValue) => setValueWrapper({ ...value, end: newValue })}
      />
    </Group>
  );
}
