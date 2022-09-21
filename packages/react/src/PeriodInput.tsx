import { DateRangePicker, DateRangePickerValue } from '@mantine/dates';
import { Period } from '@medplum/fhirtypes';
import React, { useState } from 'react';

export interface PeriodInputProps {
  name: string;
  defaultValue?: Period;
  onChange?: (value: Period) => void;
}

export function PeriodInput(props: PeriodInputProps): JSX.Element {
  // const [value, setValue] = useState(props.defaultValue);

  // function setValueWrapper(newValue: Period): void {
  //   setValue(newValue);
  //   if (props.onChange) {
  //     props.onChange(newValue);
  //   }
  // }
  const [value, setValue] = useState<DateRangePickerValue>([
    props.defaultValue?.start ? new Date(props.defaultValue.start) : null, // new Date(2021, 11, 1),
    props.defaultValue?.end ? new Date(props.defaultValue.end) : null, // new Date(2021, 11, 5)
  ]);

  function setValueWrapper(newValue: DateRangePickerValue): void {
    setValue(newValue);
    if (props.onChange) {
      props.onChange({
        start: newValue[0]?.toISOString(),
        end: newValue[1]?.toISOString(),
      });
    }
  }

  return (
    // <Group spacing="xs" grow noWrap>
    //   <Input
    //     type="datetime-local"
    //     placeholder="Start"
    //     defaultValue={value?.start}
    //     onChange={(newValue) => setValueWrapper({ ...value, start: newValue })}
    //   />
    //   <Input
    //     type="datetime-local"
    //     placeholder="End"
    //     defaultValue={value?.end}
    //     onChange={(newValue) => setValueWrapper({ ...value, end: newValue })}
    //   />
    // </Group>
    <DateRangePicker value={value} onChange={setValueWrapper} />
  );
}
