// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { NumberInput, Select, SimpleGrid, Stack, Text } from '@mantine/core';
import type { JSX } from 'react';
import { useMemo } from 'react';
import type { SchedulingParameterValues } from '../parameterValues';
import { SCHEDULING_PARAMETER_LABELS } from '../parameterValues';
import classes from './SchedulingParametersEditor.module.css';
import type {
  SchedulingParameter,
  SchedulingParameterErrors,
  SchedulingParameterLabels,
} from './SchedulingParametersEditor.utils';
import { getTimezoneOptions } from './SchedulingParametersEditor.utils';

/** How far an arrow press moves a minutes field. */
const MINUTES_STEP = 5;

/** The parameters edited in minutes. */
type NumericParameter = 'duration' | 'bufferBefore' | 'bufferAfter' | 'alignmentInterval' | 'alignmentOffset';

/** The parameters carrying an IANA time zone, which share one option list. */
type TimezoneParameter = 'timezone' | 'alignmentTimezone';

/**
 * Puts the description under the input rather than above it, so a description that wraps pushes nothing
 * around: the labels and inputs stay on the same lines across a row whatever the copy does.
 */
const DESCRIPTION_BELOW = ['label', 'input', 'description', 'error'] as const;

interface SchedulingParametersFieldsProps {
  /** The parameters as entered, in minutes. */
  readonly values: SchedulingParameterValues;
  /**
   * What takes effect where a field is left empty, shown as its placeholder. At service level these are
   * scheduling's own defaults; a calendar-level editor passes the service's values instead.
   */
  readonly defaults: SchedulingParameterValues;
  /**
   * Names where each empty field's value comes from, for example `Follow-up visit` on a calendar's override.
   * A parameter left out is labelled `default`.
   */
  readonly defaultLabels: SchedulingParameterLabels;
  /** Messages to show against a field, keyed by parameter. */
  readonly errors: SchedulingParameterErrors;
  /** Prefix for each field's `id`, so a warning elsewhere in the form can move focus to one. */
  readonly idPrefix: string;
  readonly onChange: (values: SchedulingParameterValues) => void;
  readonly disabled?: boolean;
  /** The parameters to render a field for. Defaults to all of them. A group left with no fields is dropped. */
  readonly visible?: ReadonlySet<SchedulingParameter>;
}

/**
 * Renders a placeholder naming what an empty field falls back to, so a blank is legible as inherited rather
 * than as zero.
 * @param defaults - What takes effect where a field is left empty.
 * @param key - The parameter the field edits.
 * @param labels - Names where each fallback comes from.
 * @returns The placeholder text.
 */
function placeholderFor(
  defaults: SchedulingParameterValues,
  key: keyof SchedulingParameterValues,
  labels: SchedulingParameterLabels
): string {
  const fallback = defaults[key];
  return fallback === undefined ? 'Not set' : `${fallback} (${labels[key] ?? 'default'})`;
}

/**
 * Edits the flat scheduling parameters, knowing nothing about whether they belong to a visit type or to one
 * calendar's override of it. The owning editor holds the state, decides what blocks a save, and says
 * anything level-specific.
 * @param props - Current values, the fallbacks behind them, field errors, and a change handler.
 * @returns The parameter fields.
 */
export function SchedulingParametersFields(props: SchedulingParametersFieldsProps): JSX.Element {
  const { values, defaults, defaultLabels, errors, idPrefix, onChange, disabled, visible } = props;
  const shows = (key: SchedulingParameter): boolean => !visible || visible.has(key);
  const showTimezones = shows('timezone') || shows('alignmentTimezone');

  // Gated inside the memo: listing and sorting the runtime's zones is wasted when neither zone field shows.
  const timezoneOptions = useMemo(
    () => (showTimezones ? getTimezoneOptions([values.timezone, values.alignmentTimezone]) : []),
    [showTimezones, values.timezone, values.alignmentTimezone]
  );

  function setValue(key: keyof SchedulingParameterValues, value: number | string | undefined): void {
    onChange({ ...values, [key]: value });
  }

  // Mantine hands back the raw string while a field is mid-edit, and an empty string once it is cleared.
  // Anything that is not a number becomes undefined, which is what "not set" is, rather than NaN.
  function setNumber(key: NumericParameter | 'slotCapacity', raw: number | string): void {
    if (raw === '') {
      setValue(key, undefined);
      return;
    }
    const value = typeof raw === 'number' ? raw : Number(raw);
    setValue(key, Number.isNaN(value) ? undefined : value);
  }

  function minutesField(key: NumericParameter, options: { min: number; description?: string }): JSX.Element | null {
    if (!shows(key)) {
      return null;
    }
    const { min, description } = options;
    const label = SCHEDULING_PARAMETER_LABELS[key];
    return (
      <NumberInput
        key={key}
        id={`${idPrefix}-${key}`}
        label={label}
        description={description}
        inputWrapperOrder={[...DESCRIPTION_BELOW]}
        value={values[key] ?? ''}
        placeholder={placeholderFor(defaults, key, defaultLabels)}
        error={errors[key]}
        disabled={disabled}
        onChange={(raw) => setNumber(key, raw)}
        min={min}
        step={MINUTES_STEP}
        // An empty field steps from here. Mantine's default of 0, clamped up to a minimum of 1, would put
        // every arrow press after it off the grid: 1, 6, 11.
        startValue={Math.ceil(min / MINUTES_STEP) * MINUTES_STEP}
        suffix=" min"
        allowDecimal={false}
        data-testid={`scheduling-parameters-${key}`}
      />
    );
  }

  function timezoneField(key: TimezoneParameter, description: string): JSX.Element | null {
    if (!shows(key)) {
      return null;
    }
    const label = SCHEDULING_PARAMETER_LABELS[key];
    return (
      <Select
        key={key}
        id={`${idPrefix}-${key}`}
        label={label}
        description={description}
        inputWrapperOrder={[...DESCRIPTION_BELOW]}
        data={timezoneOptions}
        value={values[key] ?? null}
        placeholder={placeholderFor(defaults, key, defaultLabels)}
        error={errors[key]}
        disabled={disabled}
        onChange={(next) => setValue(key, next ?? undefined)}
        searchable
        clearable
        comboboxProps={{ keepMounted: false }}
        clearButtonProps={{ 'aria-label': `Clear ${label.toLowerCase()}` }}
        nothingFoundMessage="No matching time zone"
        data-testid={`scheduling-parameters-${key}`}
      />
    );
  }

  function group(title: string, fields: (JSX.Element | null)[]): JSX.Element | null {
    if (fields.every((field) => field === null)) {
      return null;
    }
    return (
      <Stack gap="xs">
        <Text fw={600}>{title}</Text>
        <SimpleGrid cols={{ base: 1, sm: 3 }} spacing="md" className={classes.fieldGrid}>
          {fields}
        </SimpleGrid>
      </Stack>
    );
  }

  const capacityField = shows('slotCapacity') ? (
    <NumberInput
      key="slotCapacity"
      id={`${idPrefix}-slotCapacity`}
      label={SCHEDULING_PARAMETER_LABELS.slotCapacity}
      description="How many appointments may run at once, so anything above 1 allows overbooking"
      inputWrapperOrder={[...DESCRIPTION_BELOW]}
      value={values.slotCapacity ?? ''}
      placeholder={placeholderFor(defaults, 'slotCapacity', defaultLabels)}
      error={errors.slotCapacity}
      disabled={disabled}
      onChange={(raw) => setNumber('slotCapacity', raw)}
      min={1}
      step={1}
      allowDecimal={false}
      data-testid="scheduling-parameters-slotCapacity"
    />
  ) : null;

  return (
    <Stack gap="xl">
      {group('Length and spacing', [
        minutesField('duration', { min: 1 }),
        minutesField('bufferBefore', { min: 0 }),
        minutesField('bufferAfter', { min: 0 }),
      ])}
      {group('Start times', [
        minutesField('alignmentInterval', { min: 1, description: 'Start times are this far apart' }),
        minutesField('alignmentOffset', {
          min: 0,
          description: 'Pushes every start later, so 5 turns 9:00 and 9:30 into 9:05 and 9:35',
        }),
        timezoneField('alignmentTimezone', 'Whose midnight the start times are counted from'),
      ])}
      {group('Booking', [capacityField, timezoneField('timezone', 'The working hours are read in this zone')])}
    </Stack>
  );
}
