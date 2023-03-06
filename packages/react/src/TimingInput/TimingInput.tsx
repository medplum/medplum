import { Button, Checkbox, Group, Modal, NativeSelect, TextInput } from '@mantine/core';
import { formatTiming } from '@medplum/core';
import { Timing, TimingRepeat } from '@medplum/fhirtypes';
import React, { useRef, useState } from 'react';
import { DateTimeInput } from '../DateTimeInput/DateTimeInput';
import { FormSection } from '../FormSection/FormSection';

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

  function setStart(newStart: string): void {
    setValue({ ...valueRef.current, event: [newStart] });
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
    <Modal
      title="Timing"
      closeButtonProps={{ 'aria-label': 'Close' }}
      opened={props.visible}
      onClose={() => props.onCancel()}
    >
      <div style={{ padding: '5px 20px', textAlign: 'left' }}>
        <FormSection title="Starts on" htmlFor={'timing-dialog-start'}>
          <DateTimeInput name={'timing-dialog-start'} onChange={(newValue) => setStart(newValue)} />
        </FormSection>
        <FormSection title="Repeat every" htmlFor={'timing-dialog-period'}>
          <Group spacing="xs" grow noWrap>
            <TextInput
              type="number"
              step={1}
              id="timing-dialog-period"
              name="timing-dialog-period"
              defaultValue={value?.repeat?.period}
              onChange={(e) => setPeriod(parseInt(e.currentTarget.value))}
            />
            <NativeSelect
              id="timing-dialog-periodUnit"
              name="timing-dialog-periodUnit"
              defaultValue={value?.repeat?.periodUnit}
              onChange={(e) => setPeriodUnit(e.currentTarget.value as 'a' | 'd' | 'wk' | 'mo' | undefined)}
              data={[
                { label: 'day', value: 'd' },
                { label: 'week', value: 'wk' },
                { label: 'month', value: 'mo' },
                { label: 'year', value: 'a' },
              ]}
            />
          </Group>
        </FormSection>
        <FormSection title="Repeat on">
          <Group spacing="xs" grow noWrap>
            {daysOfWeek.map((day) => (
              <React.Fragment key={day}>
                <label htmlFor={'timing-dialog-repeat-' + day}>{day.charAt(0).toUpperCase()}</label>
                <Checkbox
                  id={'timing-dialog-repeat-' + day}
                  name={'timing-dialog-repeat-' + day}
                  onChange={(e) => setDayOfWeek(day as DayOfWeek, e.currentTarget.checked)}
                />
              </React.Fragment>
            ))}
          </Group>
        </FormSection>
      </div>
      <Button onClick={() => props.onOk(value)}>OK</Button>
    </Modal>
  );
}
