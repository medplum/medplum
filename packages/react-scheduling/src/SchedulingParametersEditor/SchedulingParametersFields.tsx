// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { NumberInput, SimpleGrid, Stack, Text } from '@mantine/core';
import type { JSX } from 'react';
import type { SchedulingParameterValues } from '../parameterValues';
import { DiscouragedTimezoneInput } from './DiscouragedTimezoneInput';
import classes from './SchedulingParametersEditor.module.css';
import type { SchedulingParameterErrors } from './SchedulingParametersEditor.utils';
import { TimezoneSelect } from './TimezoneSelect';

/** How far an arrow press moves a minutes field. */
const MINUTES_STEP = 5;

/** The numeric parameters, which are all minutes apart from capacity. */
type NumericParameter = 'duration' | 'bufferBefore' | 'bufferAfter' | 'alignmentInterval' | 'alignmentOffset';

/** The parameters carrying an IANA time zone, which share one mode. */
type TimezoneParameter = 'timezone' | 'alignmentTimezone';

/**
 * Puts the description under the input rather than above it, so a description that wraps pushes nothing
 * around: the labels and inputs stay on the same lines across a row whatever the copy does. Only the
 * start time fields carry one; the rest are named clearly enough not to need it.
 */
const DESCRIPTION_BELOW = ['label', 'input', 'description', 'error'] as const;

/**
 * How both time zone fields appear. They share one mode so a level that does not set time zones here is not
 * offering one of them and hiding the other. `discouraged` is for a level where scheduling accepts a time
 * zone but this form does not offer to set one: a stored value is shown read-only with a way to remove it,
 * and nothing new can be entered. `hidden` leaves both fields out.
 */
export type TimezoneFieldMode = 'editable' | 'discouraged' | 'hidden';

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
  readonly onChange: (values: SchedulingParameterValues) => void;
  readonly disabled?: boolean;
  /** Applies to `timezone` and `alignmentTimezone` alike. Defaults to `editable`. */
  readonly timezoneMode?: TimezoneFieldMode;
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
  const { values, defaults, defaultsLabel, errors, onChange, disabled, timezoneMode = 'editable' } = props;

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

  /**
   * Renders one time zone field, or nothing where the mode hides them. Copy differs per field because
   * removing one has a different consequence from removing the other.
   * @param key - The parameter the field edits.
   * @param label - The field label.
   * @param copy - The description for each state the field can be in.
   * @param copy.editable - Shown where a time zone can be picked.
   * @param copy.stored - Shown where one is stored and read-only.
   * @param copy.unset - Shown where the resource never set one.
   * @param copy.removed - Shown once a stored one is marked for removal.
   * @returns The field, or null where time zones are hidden.
   */
  function timezoneField(
    key: TimezoneParameter,
    label: string,
    copy: { editable?: string; stored: string; unset: string; removed: string }
  ): JSX.Element | null {
    if (timezoneMode === 'hidden') {
      return null;
    }
    if (timezoneMode === 'editable') {
      return (
        <TimezoneSelect
          label={label}
          description={copy.editable}
          value={values[key]}
          placeholder={placeholderFor(defaults, key, defaultsLabel)}
          error={errors[key]}
          disabled={disabled}
          onChange={(value) => setValue(key, value)}
          testId={`scheduling-parameters-${key}`}
        />
      );
    }
    return (
      <DiscouragedTimezoneInput
        label={label}
        value={values[key]}
        description={copy.stored}
        unsetDescription={copy.unset}
        removedDescription={copy.removed}
        disabled={disabled}
        onChange={(value) => setValue(key, value)}
        testId={`scheduling-parameters-${key}`}
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
          {timezoneField('alignmentTimezone', 'Alignment time zone', {
            editable: 'Whose midnight the start times are counted from',
            stored: 'Start times are counted from this zone’s midnight.',
            unset: 'Not set here. Start times are counted from UTC midnight.',
            removed:
              'Removed on save. Start times will be counted from UTC midnight, so they shift by an hour ' +
              'either side of a daylight saving change.',
          })}
        </SimpleGrid>
      </Stack>

      <Stack gap="xs">
        <Text fw={600}>Booking</Text>
        <SimpleGrid cols={{ base: 1, sm: 3 }} spacing="md" className={classes.fieldGrid}>
          <NumberInput
            label="Concurrent appointments"
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
          {timezoneField('timezone', 'Time zone', {
            stored: 'Best set on each calendar, or on the practitioner, room, or device it belongs to.',
            unset: 'Not set here. Each calendar uses the time zone of its practitioner, room, or device.',
            removed: 'Removed on save. Each calendar will use the time zone of its practitioner, room, or device.',
          })}
        </SimpleGrid>
      </Stack>
    </Stack>
  );
}
