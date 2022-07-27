import { formatTiming } from '@medplum/core';
import { Timing, TimingRepeat } from '@medplum/fhirtypes';
import React, { useRef, useState } from 'react';
import { Button } from './Button';
import { Checkbox } from './Checkbox';
import { DateTimeInput } from './DateTimeInput';
import { Dialog } from './Dialog';
import { FormSection } from './FormSection';
import { Input } from './Input';
import { InputRow } from './InputRow';
import { Select } from './Select';

const daysOfWeek = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'];

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
      <InputRow>
        <span>{formatTiming(valueRef.current) || 'No repeat'}</span>
        <Button onClick={() => setOpen(true)}>Edit</Button>
      </InputRow>
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

  function setStart(newStart: string): void {
    setValue({ ...valueRef.current, event: [newStart] });
  }

  function setRepeat(repeat: TimingRepeat): void {
    setValue({ ...valueRef.current, repeat });
  }

  function setPeriod(newPeriod: number | undefined): void {
    setRepeat({ ...valueRef.current?.repeat, period: newPeriod });
  }

  function setPeriodUnit(newPeriodUnit: string | undefined): void {
    setRepeat({ ...valueRef.current?.repeat, periodUnit: newPeriodUnit });
  }

  function setDayOfWeek(day: string, enabled: boolean): void {
    if (enabled) {
      addDayOfWeek(day);
    } else {
      removeDayOfWeek(day);
    }
  }

  function addDayOfWeek(day: string): void {
    const existing = valueRef.current?.repeat?.dayOfWeek || [];
    if (!existing.includes(day)) {
      setRepeat({ ...valueRef.current?.repeat, dayOfWeek: [...existing, day] });
    }
  }

  function removeDayOfWeek(day: string): void {
    const existing = valueRef.current?.repeat?.dayOfWeek || [];
    if (existing.includes(day)) {
      setRepeat({ ...valueRef.current?.repeat, dayOfWeek: existing.filter((d) => d !== day) });
    }
  }

  return (
    <Dialog title="Timing" visible={props.visible} onOk={() => props.onOk(value)} onCancel={() => props.onCancel()}>
      <div style={{ padding: '5px 20px', textAlign: 'left' }}>
        <FormSection title="Starts on" htmlFor={'timing-dialog-start'}>
          <DateTimeInput name={'timing-dialog-start'} onChange={(newValue) => setStart(newValue)} />
        </FormSection>
        <FormSection title="Repeat every" htmlFor={'timing-dialog-period'}>
          <InputRow>
            <Input
              type="number"
              step={1}
              name={'timing-dialog-period'}
              defaultValue={value?.repeat?.period}
              onChange={(newValue) => setPeriod(parseInt(newValue))}
            />
            <Select
              name={'timing-dialog-periodUnit'}
              defaultValue={value?.repeat?.periodUnit}
              onChange={(newValue) => setPeriodUnit(newValue)}
            >
              <option value="d">day</option>
              <option value="wk">week</option>
              <option value="mo">month</option>
              <option value="a">year</option>
            </Select>
          </InputRow>
        </FormSection>
        <FormSection title="Repeat on">
          <InputRow>
            {daysOfWeek.map((day) => (
              <React.Fragment key={day}>
                <label htmlFor={'timing-dialog-repeat-' + day}>{day.charAt(0).toUpperCase()}</label>
                <Checkbox name={'timing-dialog-repeat-' + day} onChange={(newValue) => setDayOfWeek(day, newValue)} />
              </React.Fragment>
            ))}
          </InputRow>
        </FormSection>
      </div>
    </Dialog>
  );
}
