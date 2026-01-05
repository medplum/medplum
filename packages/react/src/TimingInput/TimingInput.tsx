// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { Box, Button, Chip, Group, Modal, NativeSelect, Stack, Switch, TextInput } from '@mantine/core';
import { formatTiming } from '@medplum/core';
import type { Timing, TimingRepeat } from '@medplum/fhirtypes';
import type { JSX } from 'react';
import { useContext, useMemo, useRef, useState } from 'react';

import { DateTimeInput } from '../DateTimeInput/DateTimeInput';
import { ElementsContext } from '../ElementsInput/ElementsInput.utils';
import { FormSection } from '../FormSection/FormSection';
import type { ComplexTypeInputProps } from '../ResourcePropertyInput/ResourcePropertyInput.utils';
import { ArrayAddButton } from '../buttons/ArrayAddButton';
import { ArrayRemoveButton } from '../buttons/ArrayRemoveButton';

const daysOfWeek: DayOfWeek[] = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'];

type DayOfWeek = 'sun' | 'mon' | 'tue' | 'wed' | 'thu' | 'fri' | 'sat';

type PeriodUnit = 'a' | 's' | 'min' | 'h' | 'd' | 'wk' | 'mo';

// Internal state wrapper for `repeat.timeOfDay` array entries; used to provide
// a stable ID to each raw string.
type TimeOfDayItem = { id: number; value: string };

export interface TimingInputProps extends ComplexTypeInputProps<Timing> {
  readonly defaultModalOpen?: boolean;
}

export function TimingInput(props: TimingInputProps): JSX.Element {
  const [value, setValue] = useState<Timing | undefined>(props.defaultValue);
  const [open, setOpen] = useState(!props.disabled && (props.defaultModalOpen ?? false));

  return (
    <>
      <Group gap="xs" grow wrap="nowrap">
        <span data-testid="timinginput-display">{formatTiming(value) || 'No repeat'}</span>
        <Button disabled={props.disabled} onClick={() => setOpen(true)}>
          Edit
        </Button>
      </Group>
      {!props.disabled && (
        <TimingEditorDialog
          path={props.path}
          visible={open}
          defaultValue={value}
          onOk={(newValue) => {
            if (props.onChange) {
              props.onChange(newValue);
            }
            setValue(newValue);
            setOpen(false);
          }}
          onCancel={() => setOpen(false)}
        />
      )}
    </>
  );
}

interface TimingEditorDialogProps {
  readonly path: string;
  readonly visible: boolean;
  readonly defaultValue?: Timing;
  readonly onOk: (newValue: Timing) => void;
  readonly onCancel: () => void;
}

const defaultValue: Timing = {
  repeat: {
    period: 1,
    periodUnit: 'd',
  },
};

function TimingEditorDialog(props: TimingEditorDialogProps): JSX.Element {
  const [value, setValue] = useState<Timing>(props.defaultValue || defaultValue);
  const [timeOfDayItems, setTimeOfDayItems] = useState<TimeOfDayItem[]>(() =>
    (props.defaultValue?.repeat?.timeOfDay ?? []).map((v, i) => ({ id: i, value: v }))
  );
  const nextTimeOfDayId = useRef(timeOfDayItems.length);
  const { getExtendedProps } = useContext(ElementsContext);
  const [
    eventProps,
    repeatProps,
    repeatPeriodProps,
    repeatPeriodUnitProps,
    repeatDayOfWeekProps,
    repeatTimeOfDayProps,
  ] = useMemo(
    () =>
      ['event', 'repeat', 'repeat.period', 'repeat.periodUnit', 'repeat.dayOfWeek', 'repeat.timeOfDay'].map((field) =>
        getExtendedProps(props.path + '.' + field)
      ),
    [getExtendedProps, props.path]
  );

  function setStart(newStart: string): void {
    setValue((value) => ({ ...value, event: [newStart] }));
  }

  function setRepeat(repeat: TimingRepeat | undefined): void {
    setValue((value) => ({ ...value, repeat }));
  }

  function setPeriod(period: number | undefined): void {
    setValue((value) => ({ ...value, repeat: { ...value.repeat, period } }));
  }

  function setPeriodUnit(periodUnit: PeriodUnit | undefined): void {
    setValue((value) => ({ ...value, repeat: { ...value.repeat, periodUnit } }));
  }

  function setDaysOfWeek(dayOfWeek: DayOfWeek[] | undefined): void {
    setValue((value) => ({ ...value, repeat: { ...value.repeat, dayOfWeek } }));
  }

  function setTimeOfDay(updater: (items: TimeOfDayItem[]) => TimeOfDayItem[]): void {
    setTimeOfDayItems((items) => {
      const newItems = updater(items);
      const timeOfDay = newItems.map((item) => item.value);
      setValue((value) => ({
        ...value,
        repeat: {
          ...value.repeat,
          timeOfDay,
        },
      }));
      return newItems;
    });
  }

  return (
    <Modal
      title="Timing"
      closeButtonProps={{ 'aria-label': 'Close' }}
      opened={props.visible}
      onClose={() => props.onCancel()}
    >
      <Stack gap="md">
        <FormSection title="Starts on" htmlFor="timing-dialog-start">
          <DateTimeInput
            disabled={eventProps?.readonly}
            name="timing-dialog-start"
            onChange={(newValue) => setStart(newValue)}
          />
        </FormSection>
        <Switch
          disabled={repeatProps?.readonly}
          label="Repeat"
          checked={!!value.repeat}
          onChange={(e) => setRepeat(e.currentTarget.checked ? defaultValue.repeat : undefined)}
        />
        {value.repeat && (
          <>
            <FormSection title="Repeat every" htmlFor="timing-dialog-period">
              <Group gap="xs" grow wrap="nowrap">
                <TextInput
                  disabled={repeatPeriodProps?.readonly}
                  type="number"
                  step={1}
                  id="timing-dialog-period"
                  name="timing-dialog-period"
                  defaultValue={value.repeat.period || 1}
                  onChange={(e) => setPeriod(Number.parseInt(e.currentTarget.value, 10) || 1)}
                />
                <NativeSelect
                  disabled={repeatPeriodUnitProps?.readonly}
                  id="timing-dialog-periodUnit"
                  name="timing-dialog-periodUnit"
                  defaultValue={value.repeat.periodUnit}
                  onChange={(e) => setPeriodUnit(e.currentTarget.value as PeriodUnit | undefined)}
                  data={[
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
            {value.repeat.periodUnit === 'wk' && (
              <FormSection title="Repeat on">
                <Chip.Group
                  multiple
                  onChange={setDaysOfWeek as (v: string[] | undefined) => void}
                  value={value.repeat?.dayOfWeek}
                >
                  <Group justify="space-between" mt="xs" gap="xs">
                    {daysOfWeek.map((day) => (
                      <Chip
                        key={day}
                        value={day}
                        size="xs"
                        radius="xl"
                        disabled={repeatDayOfWeekProps?.readonly}
                        checked={(value.repeat?.dayOfWeek ?? []).includes(day)}
                      >
                        {day.charAt(0).toUpperCase()}
                      </Chip>
                    ))}
                  </Group>
                </Chip.Group>
              </FormSection>
            )}
            <FormSection title="At times">
              <Stack mt="xs">
                {timeOfDayItems.map((item, idx) => (
                  <Group key={item.id}>
                    <TextInput
                      disabled={repeatTimeOfDayProps?.readonly}
                      type="time"
                      id={`timing-dialog-repeat-timeOfDay[${idx}]`}
                      name={`timing-dialog-repeat-timeOfDay[${idx}]`}
                      data-testid={`timing-repeat-timeOfDay-input-${idx}`}
                      defaultValue={item.value.slice(0, 5) /* truncate to HH:mm */}
                      onChange={(e) => {
                        const newValue = `${e.currentTarget.value}:00`;
                        setTimeOfDay((items) => items.with(idx, { ...item, value: newValue }));
                      }}
                      style={{ flexGrow: 1 }}
                    />
                    <ArrayRemoveButton
                      testId={`timing-repeat-timeOfDay-remove-${idx}`}
                      onClick={() => setTimeOfDay((items) => items.toSpliced(idx, 1))}
                    />
                  </Group>
                ))}
                <Box>
                  <ArrayAddButton
                    propertyDisplayName="Time of Day"
                    onClick={() =>
                      setTimeOfDay((items) => {
                        const id = nextTimeOfDayId.current++;
                        return items.concat({ id, value: '00:00:00' });
                      })
                    }
                  />
                </Box>
              </Stack>
            </FormSection>
          </>
        )}
        <Group justify="flex-end">
          <Button onClick={() => props.onOk(value)}>OK</Button>
        </Group>
      </Stack>
    </Modal>
  );
}
