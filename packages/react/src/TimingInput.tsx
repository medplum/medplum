import { Button, Checkbox, Group, NativeSelect, NumberInput } from '@mantine/core';
import { DatePicker } from '@mantine/dates';
import { formatTiming } from '@medplum/core';
import { Timing, TimingRepeat } from '@medplum/fhirtypes';
import React, { useRef, useState } from 'react';
import { Dialog } from './Dialog';

const daysOfWeek = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'];

type DayOfWeek = 'sun' | 'mon' | 'tue' | 'wed' | 'thu' | 'fri' | 'sat';

export interface TimingInputProps {
  name: string;
  defaultValue?: Timing;
  onChange?: (newValue: Timing) => void;
}

export function TimingInput(props: TimingInputProps): JSX.Element {
  const [value, setValue] = useState<Timing>(props.defaultValue || {});
  const [open, setOpen] = useState(false);

  const valueRef = useRef<Timing>();
  valueRef.current = value;

  return (
    <>
      <Group spacing="xs" grow noWrap>
        <span>{formatTiming(valueRef.current) || 'No repeat'}</span>
        <Button onClick={() => setOpen(true)}>Edit</Button>
      </Group>
      <TimingEditorDialog
        visible={open}
        defaultValue={valueRef.current}
        onOk={(newValue) => {
          if (props.onChange) {
            props.onChange(newValue);
          }
          setValue(newValue);
          setOpen(false);
        }}
        onCancel={() => setOpen(false)}
      />
    </>
  );
}

interface TimingEditorDialogProps {
  visible: boolean;
  defaultValue?: Timing;
  onOk: (newValue: Timing) => void;
  onCancel: () => void;
}

function TimingEditorDialog(props: TimingEditorDialogProps): JSX.Element {
  const [value, setValue] = useState<Timing>(props.defaultValue || {});

  const valueRef = useRef<Timing>();
  valueRef.current = value;

  function setStart(newStart: string | undefined): void {
    setValue({ ...valueRef.current, event: newStart ? [newStart] : undefined });
  }

  function setRepeat(repeat: TimingRepeat): void {
    setValue({ ...valueRef.current, repeat });
  }

  function setPeriod(newPeriod: number | undefined): void {
    setRepeat({ ...valueRef.current?.repeat, period: newPeriod });
  }

  function setPeriodUnit(newPeriodUnit: 'a' | 's' | 'min' | 'h' | 'd' | 'wk' | 'mo' | undefined): void {
    setRepeat({ ...valueRef.current?.repeat, periodUnit: newPeriodUnit });
  }

  function setDayOfWeek(day: DayOfWeek, enabled: boolean): void {
    if (enabled) {
      addDayOfWeek(day);
    } else {
      removeDayOfWeek(day);
    }
  }

  function addDayOfWeek(day: DayOfWeek): void {
    const existing = valueRef.current?.repeat?.dayOfWeek || [];
    if (!existing.includes(day)) {
      setRepeat({ ...valueRef.current?.repeat, dayOfWeek: [...existing, day] });
    }
  }

  function removeDayOfWeek(day: DayOfWeek): void {
    const existing = valueRef.current?.repeat?.dayOfWeek || [];
    if (existing.includes(day)) {
      setRepeat({ ...valueRef.current?.repeat, dayOfWeek: existing.filter((d) => d !== day) });
    }
  }

  return (
    <Dialog title="Timing" visible={props.visible} onOk={() => props.onOk(value)} onCancel={() => props.onCancel()}>
      <div style={{ padding: '5px 20px', textAlign: 'left' }}>
        <DatePicker
          placeholder="Pick date"
          label="Starts on"
          onChange={(newValue) => setStart(newValue?.toISOString())}
        />
        <h3>Repeat every</h3>
        <Group spacing="xs" grow noWrap>
          <NumberInput
            step={1}
            name={'timing-dialog-period'}
            defaultValue={value?.repeat?.period}
            onChange={(newValue) => setPeriod(newValue)}
          />
          <NativeSelect
            name={'timing-dialog-periodUnit'}
            defaultValue={value?.repeat?.periodUnit}
            onChange={(e) => setPeriodUnit(e.currentTarget.value as 'a' | 'd' | 'wk' | 'mo' | undefined)}
            data={[
              { value: 'd', label: 'day' },
              { value: 'wk', label: 'week' },
              { value: 'mo', label: 'month' },
              { value: 'a', label: 'year' },
            ]}
          />
        </Group>
        <h3>Repeat on</h3>
        <Group spacing="xs" grow noWrap>
          {daysOfWeek.map((day) => (
            <React.Fragment key={day}>
              <label htmlFor={'timing-dialog-repeat-' + day}>{day.charAt(0).toUpperCase()}</label>
              <Checkbox
                name={'timing-dialog-repeat-' + day}
                onChange={(e) => setDayOfWeek(day as DayOfWeek, e.currentTarget.checked)}
              />
            </React.Fragment>
          ))}
        </Group>
      </div>
    </Dialog>
  );
}
