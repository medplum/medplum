import { DateRangePicker, DateRangePickerValue } from '@mantine/dates';
import { Period } from '@medplum/fhirtypes';
import React, { useState } from 'react';

export interface PeriodInputProps {
  name: string;
  defaultValue?: Period;
  placeholder?: string;
  onChange?: (value: Period) => void;
}

export function PeriodInput(props: PeriodInputProps): JSX.Element {
  const [value, setValue] = useState<DateRangePickerValue>([
    props.defaultValue?.start ? new Date(props.defaultValue.start) : null,
    props.defaultValue?.end ? new Date(props.defaultValue.end) : null,
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

  return <DateRangePicker value={value} placeholder={props.placeholder} onChange={setValueWrapper} />;
}
