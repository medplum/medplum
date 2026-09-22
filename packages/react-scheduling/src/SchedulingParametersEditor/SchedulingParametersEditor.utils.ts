// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import type { SchedulingParameterValues } from '../parameterValues';
import { FLAT_PARAMETERS } from '../parameterValues';

/** Minutes in a day, the longest alignment interval scheduling accepts. */
export const MINUTES_PER_DAY = 1440;

/** Minutes in an hour, which is how far the clocks move at a daylight saving change. */
const MINUTES_PER_HOUR = 60;

/**
 * What scheduling uses for a parameter nothing sets. `duration` and `timezone` have none: without a duration
 * a visit type is bookable only where a calendar sets one, and timezone falls back to the calendar's actor.
 */
export const SCHEDULING_PARAMETER_DEFAULTS: SchedulingParameterValues = {
  bufferBefore: 0,
  bufferAfter: 0,
  alignmentInterval: 60,
  alignmentOffset: 0,
  slotCapacity: 1,
  alignmentTimezone: 'Etc/UTC',
};

/** Where a set of parameters is stored: on the visit type itself, or on one calendar's override of it. */
export type SchedulingParameterLevel = 'service' | 'schedule';

export type SchedulingParameter = keyof SchedulingParameterValues;

/**
 * The parameters a level offers a field for only once it already stores one. Most of these follow the
 * scheduling docs: calendars booked together must agree on duration and the alignment grid, so a Schedule is
 * steered away from all four, and a visit type offered in several places has no one `timezone`.
 *
 * `alignmentTimezone` on a service is the exception, and is not here because the docs discourage it. They
 * recommend setting it on the HealthcareService. It is held back so that a visit type's two time zone fields
 * appear together, since showing either one shows both: offering this one unconditionally would pull
 * `timezone` on screen with it, against the docs.
 */
export const HIDDEN_PARAMETERS: Record<SchedulingParameterLevel, readonly SchedulingParameter[]> = {
  service: ['timezone', 'alignmentTimezone'],
  schedule: ['duration', 'alignmentInterval', 'alignmentOffset', 'alignmentTimezone'],
};

function withInherited(
  values: SchedulingParameterValues,
  inherited: SchedulingParameterValues
): SchedulingParameterValues {
  const stored = Object.entries(values).filter(([, value]) => value !== undefined);
  return { ...inherited, ...Object.fromEntries(stored) };
}

/**
 * The fields to offer at a level. A hidden parameter is offered only when the level already stores it, so a
 * stored value is never in force unseen and can always be cleared.
 * @param level - Where the parameters are stored.
 * @param initial - The parameters the form loaded.
 * @returns The parameters to render a field for.
 */
export function getVisibleParameters(
  level: SchedulingParameterLevel,
  initial: SchedulingParameterValues
): Set<SchedulingParameter> {
  const hidden = HIDDEN_PARAMETERS[level];
  const visible = new Set<SchedulingParameter>(
    FLAT_PARAMETERS.filter((key) => !hidden.includes(key) || initial[key] !== undefined)
  );
  // A visit type offers both time zones or neither.
  if (level === 'service' && (visible.has('timezone') || visible.has('alignmentTimezone'))) {
    visible.add('timezone');
    visible.add('alignmentTimezone');
  }
  return visible;
}

/** Names where an empty field's fallback comes from, per parameter. */
export type SchedulingParameterLabels = Partial<Record<SchedulingParameter, string>>;

/**
 * What an empty field on a calendar's override falls back to: the visit type's value where it sets one,
 * otherwise scheduling's own default.
 * @param serviceValues - The parameters the visit type sets.
 * @param serviceLabel - Names the visit type in a placeholder.
 * @returns The fallback for each parameter, and the label naming where each comes from.
 */
export function getInheritedDefaults(
  serviceValues: SchedulingParameterValues,
  serviceLabel: string
): { defaults: SchedulingParameterValues; labels: SchedulingParameterLabels } {
  const labels: SchedulingParameterLabels = {};
  for (const key of FLAT_PARAMETERS) {
    labels[key] = serviceValues[key] === undefined ? 'default' : serviceLabel;
  }
  return { defaults: withInherited(serviceValues, SCHEDULING_PARAMETER_DEFAULTS), labels };
}

/** A field that cannot be saved as entered, keyed by the parameter it belongs to. */
export type SchedulingParameterErrors = Partial<Record<keyof SchedulingParameterValues, string>>;

/** Something worth saying about a combination of values, which never blocks a save. */
export interface SchedulingParameterWarning {
  /** Stable identifier, used for the test id and the React key. */
  readonly id: string;
  readonly message: string;
  /** The field the message names, and the words in it that jump there. */
  readonly focus?: {
    readonly field: keyof SchedulingParameterValues;
    readonly text: string;
  };
  /**
   * The parameters that raise it. A calendar's override shows it only when the calendar sets one of them,
   * since otherwise only the visit type can fix it. Absent on a warning that always shows.
   */
  readonly inputs?: readonly SchedulingParameter[];
}

/**
 * Whether the runtime can interpret a timezone identifier. Aliases and unusual casing are accepted, the way
 * scheduling accepts them.
 * @param value - The IANA identifier to test.
 * @returns True when the runtime resolves it.
 */
export function isSupportedTimezone(value: string): boolean {
  try {
    // Constructing the formatter is the check: an identifier the runtime cannot resolve throws here.
    Intl.DateTimeFormat('en-US', { timeZone: value });
    return true;
  } catch {
    return false;
  }
}

/**
 * The timezones to offer, with anything already stored added so a value the runtime does not list is still
 * shown rather than silently dropped from the field.
 * @param stored - Identifiers already on the resource, which may include ones the runtime does not list.
 * @returns Sorted identifiers, free of duplicates.
 */
export function getTimezoneOptions(stored: (string | undefined)[] = []): string[] {
  let supported: string[] = [];
  try {
    supported = Intl.supportedValuesOf('timeZone');
  } catch {
    // Older runtimes do not implement supportedValuesOf. The stored values still have to be selectable,
    // and UTC is always a legitimate answer, so the field degrades to those rather than to nothing.
    supported = ['Etc/UTC'];
  }
  return [...new Set([...supported, ...stored.filter((value): value is string => !!value)])].sort((a, b) =>
    a.localeCompare(b)
  );
}

function checkInteger(value: number | undefined, minimum: number, label: string): string | undefined {
  if (value === undefined) {
    return undefined;
  }
  if (!Number.isInteger(value)) {
    return `${label} must be a whole number of minutes.`;
  }
  return value < minimum ? `${label} must be ${minimum} or more.` : undefined;
}

/**
 * Finds the values scheduling would refuse. Everything here blocks a save; anything merely inadvisable is a
 * warning instead.
 * @param values - The parameters as entered, in minutes.
 * @returns A message per field that cannot be saved, empty when every field is valid.
 */
export function validateSchedulingParameters(values: SchedulingParameterValues): SchedulingParameterErrors {
  const errors: SchedulingParameterErrors = {};

  errors.duration = checkInteger(values.duration, 1, 'Duration');
  errors.bufferBefore = checkInteger(values.bufferBefore, 0, 'Buffer before');
  errors.bufferAfter = checkInteger(values.bufferAfter, 0, 'Buffer after');
  errors.alignmentOffset = checkInteger(values.alignmentOffset, 0, 'Offset');

  errors.alignmentInterval =
    checkInteger(values.alignmentInterval, 1, 'Interval') ??
    // The server's own limit. The alignment grid restarts at local midnight each day, so an interval longer
    // than a day never comes round again.
    (values.alignmentInterval !== undefined && values.alignmentInterval > MINUTES_PER_DAY
      ? 'Interval cannot be more than 1440 minutes (1 day).'
      : undefined);

  if (values.slotCapacity !== undefined) {
    if (!Number.isInteger(values.slotCapacity)) {
      errors.slotCapacity = 'Concurrent appointments must be a whole number.';
    } else if (values.slotCapacity < 1) {
      errors.slotCapacity = 'Concurrent appointments must be 1 or more.';
    }
  }

  for (const key of ['timezone', 'alignmentTimezone'] as const) {
    const value = values[key];
    if (value !== undefined && !isSupportedTimezone(value)) {
      errors[key] = `${value} is not a time zone this browser recognizes.`;
    }
  }

  for (const key of Object.keys(errors) as (keyof SchedulingParameterErrors)[]) {
    if (errors[key] === undefined) {
      delete errors[key];
    }
  }

  return errors;
}

/**
 * Restricts errors to the fields actually edited, so a value already stored out of range does not lock
 * someone out of the form.
 * @param errors - Every field that cannot be saved as entered.
 * @param values - The parameters as entered.
 * @param initial - The parameters the form loaded.
 * @returns Only the errors on fields whose value has changed.
 */
export function getBlockingErrors(
  errors: SchedulingParameterErrors,
  values: SchedulingParameterValues,
  initial: SchedulingParameterValues
): SchedulingParameterErrors {
  const blocking: SchedulingParameterErrors = {};
  for (const key of Object.keys(errors) as (keyof SchedulingParameterErrors)[]) {
    if (values[key] !== initial[key]) {
      blocking[key] = errors[key];
    }
  }
  return blocking;
}

/**
 * Finds what is worth saying about a combination of values that scheduling will nevertheless accept.
 * @param stored - The parameters as entered, in minutes.
 * @param storedInitial - The parameters the form loaded, used to notice a changed capacity.
 * @param inherited - The visit type's parameters, when editing a calendar's override. Checks then judge the
 * values in effect, and keep a warning only when the calendar sets one of its inputs.
 * @returns The warnings to show, in the order they should appear.
 */
export function getSchedulingParameterWarnings(
  stored: SchedulingParameterValues,
  storedInitial: SchedulingParameterValues,
  inherited?: SchedulingParameterValues
): SchedulingParameterWarning[] {
  const values = inherited ? withInherited(stored, inherited) : stored;
  const initial = inherited ? withInherited(storedInitial, inherited) : storedInitial;
  const warnings: SchedulingParameterWarning[] = [];
  const { duration, bufferBefore, bufferAfter, alignmentInterval, alignmentOffset, slotCapacity } = values;

  if (duration === undefined) {
    warnings.push({
      id: 'no-duration',
      message: inherited
        ? 'Duration is not set on this calendar or on the visit type, so it cannot be booked here.'
        : 'Duration is not set, so this visit type can only be booked on calendars that set their own duration for this service.',
      focus: { field: 'duration', text: 'Duration' },
    });
  }

  if (slotCapacity !== undefined && slotCapacity > 1 && ((bufferBefore ?? 0) > 0 || (bufferAfter ?? 0) > 0)) {
    warnings.push({
      id: 'capacity-with-buffers',
      inputs: ['slotCapacity', 'bufferBefore', 'bufferAfter'],
      message:
        'Concurrent appointments is above 1, but buffer time is never shared, so the first appointment’s Buffer ' +
        'before or Buffer after blocks the others. Set both buffers to 0 to allow concurrent appointments.',
    });
  }

  // Compared as the capacity that takes effect, so filling an empty field with the default, or clearing a
  // field that held it, changes nothing worth warning about.
  const defaultCapacity = SCHEDULING_PARAMETER_DEFAULTS.slotCapacity;
  if ((slotCapacity ?? defaultCapacity) !== (initial.slotCapacity ?? defaultCapacity)) {
    warnings.push({
      id: 'capacity-not-retroactive',
      inputs: ['slotCapacity'],
      message:
        'Changing Concurrent appointments only affects new bookings. Existing appointments keep the limit they ' +
        'were booked under.',
    });
  }

  if (alignmentInterval !== undefined && alignmentInterval > 0 && MINUTES_PER_DAY % alignmentInterval !== 0) {
    warnings.push({
      id: 'alignment-uneven',
      inputs: ['alignmentInterval'],
      message:
        'Interval does not divide evenly into 24 hours. Start times restart at midnight each day, so they will ' +
        'not carry cleanly from one day to the next.',
    });
  }

  // A grid anchored to UTC survives a daylight saving change only when moving it by an hour lands it back on
  // itself, which needs an interval that divides into 60. At 90 or 120 every local start time moves instead.
  // Skipped where the interval does not divide into a day, since `alignment-uneven` already covers that and
  // the daily restart is the larger problem.
  if (
    alignmentInterval !== undefined &&
    alignmentInterval > 0 &&
    MINUTES_PER_DAY % alignmentInterval === 0 &&
    MINUTES_PER_HOUR % alignmentInterval !== 0 &&
    (values.alignmentTimezone ?? SCHEDULING_PARAMETER_DEFAULTS.alignmentTimezone) === 'Etc/UTC'
  ) {
    warnings.push({
      id: 'alignment-dst-shift',
      inputs: ['alignmentInterval', 'alignmentTimezone'],
      message:
        'Interval does not divide into an hour, and start times are counted from UTC midnight, so every start ' +
        'time moves by an hour when the clocks change. Use an interval that divides into 60, or set an ' +
        'alignment time zone that observes the change.',
    });
  }

  if (duration !== undefined && alignmentInterval !== undefined && alignmentInterval !== duration) {
    warnings.push({
      id: 'alignment-against-duration',
      inputs: ['duration', 'alignmentInterval'],
      message:
        alignmentInterval > duration
          ? 'Interval is longer than Duration, so there will be a gap between appointments. Set Interval to ' +
            'match Duration to schedule appointments back to back.'
          : 'Interval is shorter than Duration, so an appointment can start before the previous one ends.',
    });
  }

  if (alignmentOffset !== undefined && alignmentInterval !== undefined && alignmentOffset >= alignmentInterval) {
    warnings.push({
      id: 'offset-exceeds-interval',
      inputs: ['alignmentOffset', 'alignmentInterval'],
      message:
        `Offset is as long as Interval or longer, so it wraps around: ${alignmentOffset} minutes works the same ` +
        `as ${alignmentOffset % alignmentInterval}.`,
    });
  }

  if (!inherited) {
    return warnings;
  }
  const setHere = (key: SchedulingParameter): boolean => stored[key] !== undefined || storedInitial[key] !== undefined;
  return warnings.filter((warning) => !warning.inputs || warning.inputs.some(setHere));
}
