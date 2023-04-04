import { Button, Chip, Group, Modal, NativeSelect, Stack, Switch, TextInput } from '@mantine/core';
import { formatTiming } from '@medplum/core';
import { Timing, TimingRepeat } from '@medplum/fhirtypes';
import React, { useRef, useState } from 'react';
import { DateTimeInput } from '../DateTimeInput/DateTimeInput';
import { FormSection } from '../FormSection/FormSection';

const daysOfWeek = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'];

type DayOfWeek = 'sun' | 'mon' | 'tue' | 'wed' | 'thu' | 'fri' | 'sat';

type PeriodUnit = 'a' | 's' | 'min' | 'h' | 'd' | 'wk' | 'mo';

export interface TimingInputProps {
  name: string;
  defaultValue?: Timing;
  onChange?: (newValue: Timing) => void;
}

export function TimingInput(props: TimingInputProps): JSX.Element {
  const [value, setValue] = useState<Timing | undefined>(props.defaultValue);
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

const defaultValue: Timing = {
  repeat: {
    period: 1,
    periodUnit: 'd',
  },
};

function TimingEditorDialog(props: TimingEditorDialogProps): JSX.Element {
  const [value, setValue] = useState<Timing>(props.defaultValue || defaultValue);

  const valueRef = useRef<Timing>();
  valueRef.current = value;

  function setStart(newStart: string): void {
    setValue({ ...valueRef.current, event: [newStart] });
  }

  function setRepeat(repeat: TimingRepeat | undefined): void {
    setValue({ ...valueRef.current, repeat });
  }

  function setPeriod(newPeriod: number | undefined): void {
    setRepeat({ ...valueRef.current?.repeat, period: newPeriod });
  }

  function setPeriodUnit(newPeriodUnit: PeriodUnit | undefined): void {
    setRepeat({ ...valueRef.current?.repeat, periodUnit: newPeriodUnit });
  }

  function setDaysOfWeek(newDaysOfWeek: DayOfWeek[] | undefined): void {
    setRepeat({ ...valueRef.current?.repeat, dayOfWeek: newDaysOfWeek });
  }

  return (
    <Modal
      title="Timing"
      closeButtonProps={{ 'aria-label': 'Close' }}
      opened={props.visible}
      onClose={() => props.onCancel()}
    >
      <Stack>
        <FormSection title="Starts on" htmlFor={'timing-dialog-start'}>
          <DateTimeInput name={'timing-dialog-start'} onChange={(newValue) => setStart(newValue)} />
        </FormSection>
        <Switch
          label="Repeat"
          checked={!!value.repeat}
          onChange={(e) => setRepeat(e.currentTarget.checked ? defaultValue.repeat : undefined)}
        />
        {value.repeat && (
          <>
            <FormSection title="Repeat every" htmlFor={'timing-dialog-period'}>
              <Group spacing="xs" grow noWrap>
                <TextInput
                  type="number"
                  step={1}
                  id="timing-dialog-period"
                  name="timing-dialog-period"
                  defaultValue={value?.repeat?.period || 1}
                  onChange={(e) => setPeriod(parseInt(e.currentTarget.value) || 1)}
                />
                <NativeSelect
                  id="timing-dialog-periodUnit"
                  name="timing-dialog-periodUnit"
                  defaultValue={value?.repeat?.periodUnit}
                  onChange={(e) => setPeriodUnit(e.currentTarget.value as PeriodUnit | undefined)}
                  data={[
                    { label: 'second', value: 's' },
                    { label: 'minute', value: 'min' },
                    { label: 'hour', value: 'h' },
                    { label: 'day', value: 'd' },
                    { label: 'week', value: 'wk' },
                    { label: 'month', value: 'mo' },
                    { label: 'year', value: 'a' },
                  ]}
                />
              </Group>
            </FormSection>
            {value.repeat?.periodUnit === 'wk' && (
              <FormSection title="Repeat on">
                <Chip.Group multiple onChange={setDaysOfWeek as (v: string[] | undefined) => void}>
                  <Group position="apart" mt="md" spacing="xs">
                    {daysOfWeek.map((day) => (
                      <Chip key={day} value={day} size="xs" radius="xl">
                        {day.charAt(0).toUpperCase()}
                      </Chip>
                    ))}
                  </Group>
                </Chip.Group>
              </FormSection>
            )}
          </>
        )}
        <Group position="right">
          <Button onClick={() => props.onOk(value)}>OK</Button>
        </Group>
      </Stack>
    </Modal>
  );
}
