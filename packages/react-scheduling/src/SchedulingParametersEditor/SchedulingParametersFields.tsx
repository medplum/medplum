// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { NumberInput, Select, SimpleGrid, Stack, Text } from '@mantine/core';
import type { JSX } from 'react';
import { useMemo } from 'react';
import type { SchedulingParameterValues } from '../parameterValues';
import classes from './SchedulingParametersEditor.module.css';
import type { SchedulingParameterErrors } from './SchedulingParametersEditor.utils';
import { getTimezoneOptions } from './SchedulingParametersEditor.utils';

/** How far an arrow press moves a minutes field. */
const MINUTES_STEP = 5;

/** The numeric parameters, which are all minutes apart from capacity. */
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
  /** Names where an empty field's value comes from, for example `default` or `Follow-up visit`. */
  readonly defaultsLabel: string;
  /** Messages to show against a field, keyed by parameter. */
  readonly errors: SchedulingParameterErrors;
  /** Prefix for each field's `id`, so a warning elsewhere in the form can move focus to one. */
  readonly idPrefix: string;
  readonly onChange: (values: SchedulingParameterValues) => void;
  readonly disabled?: boolean;
  /**
   * Whether to offer the two time zone fields, which are shown or hidden together so a level that does not
   * set time zones here is not offering one of them and hiding the other. Defaults to true.
   */
  readonly showTimezones?: boolean;
}

/**
 * Renders a placeholder naming what an empty field falls back to, so a blank is legible as inherited rather
 * than as zero.
 * @param defaults - What takes effect where a field is left empty.
 * @param key - The parameter the field edits.
 * @param label - Names where the fallback comes from.
 * @returns The placeholder text.
 */
function placeholderFor(
  defaults: SchedulingParameterValues,
  key: keyof SchedulingParameterValues,
  label: string
): string {
  const fallback = defaults[key];
  return fallback === undefined ? 'Not set' : `${fallback} (${label})`;
}

/**
 * Edits the flat scheduling parameters, knowing nothing about whether they belong to a visit type or to one
 * calendar's override of it. The owning editor holds the state, decides what blocks a save, and says
 * anything level-specific.
 * @param props - Current values, the fallbacks behind them, field errors, and a change handler.
 * @returns The parameter fields.
 */
export function SchedulingParametersFields(props: SchedulingParametersFieldsProps): JSX.Element {
  const { values, defaults, defaultsLabel, errors, idPrefix, onChange, disabled, showTimezones = true } = props;

  // Gated inside the memo rather than around it: listing the runtime's zones and sorting them is wasted on
  // the common case, a visit type that sets no time zone and so shows neither field.
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

  function minutesField(key: NumericParameter, label: string, min: number, description?: string): JSX.Element {
    return (
      <NumberInput
        id={`${idPrefix}-${key}`}
        label={label}
        description={description}
        inputWrapperOrder={[...DESCRIPTION_BELOW]}
        value={values[key] ?? ''}
        placeholder={placeholderFor(defaults, key, defaultsLabel)}
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

  function timezoneField(key: TimezoneParameter, label: string, description: string): JSX.Element | null {
    if (!showTimezones) {
      return null;
    }
    return (
      <Select
        id={`${idPrefix}-${key}`}
        label={label}
        description={description}
        inputWrapperOrder={[...DESCRIPTION_BELOW]}
        data={timezoneOptions}
        value={values[key] ?? null}
        placeholder={placeholderFor(defaults, key, defaultsLabel)}
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

  return (
    <Stack gap="xl">
      <Stack gap="xs">
        <Text fw={600}>Length and spacing</Text>
        <SimpleGrid cols={{ base: 1, sm: 3 }} spacing="md" className={classes.fieldGrid}>
          {minutesField('duration', 'Duration', 1)}
          {minutesField('bufferBefore', 'Buffer before', 0)}
          {minutesField('bufferAfter', 'Buffer after', 0)}
        </SimpleGrid>
      </Stack>

      <Stack gap="xs">
        <Text fw={600}>Start times</Text>
        <SimpleGrid cols={{ base: 1, sm: 3 }} spacing="md" className={classes.fieldGrid}>
          {minutesField('alignmentInterval', 'Interval', 1, 'Start times are this far apart')}
          {minutesField(
            'alignmentOffset',
            'Offset',
            0,
            'Pushes every start later, so 5 turns 9:00 and 9:30 into 9:05 and 9:35'
          )}
          {timezoneField('alignmentTimezone', 'Alignment time zone', 'Whose midnight the start times are counted from')}
        </SimpleGrid>
      </Stack>

      <Stack gap="xs">
        <Text fw={600}>Booking</Text>
        <SimpleGrid cols={{ base: 1, sm: 3 }} spacing="md" className={classes.fieldGrid}>
          <NumberInput
            id={`${idPrefix}-slotCapacity`}
            label="Concurrent appointments"
            description="How many appointments may run at once, so anything above 1 allows overbooking"
            inputWrapperOrder={[...DESCRIPTION_BELOW]}
            value={values.slotCapacity ?? ''}
            placeholder={placeholderFor(defaults, 'slotCapacity', defaultsLabel)}
            error={errors.slotCapacity}
            disabled={disabled}
            onChange={(raw) => setNumber('slotCapacity', raw)}
            min={1}
            step={1}
            allowDecimal={false}
            data-testid="scheduling-parameters-slotCapacity"
          />
          {timezoneField(
            'timezone',
            'Time zone',
            'The working hours are read in this zone, unless a calendar sets its own'
          )}
        </SimpleGrid>
      </Stack>
    </Stack>
  );
}
