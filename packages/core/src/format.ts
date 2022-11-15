import { Address, HumanName, Period, Timing, Range, Quantity } from '@medplum/fhirtypes';
import { capitalize } from './utils';

export interface AddressFormatOptions {
  all?: boolean;
  use?: boolean;
}

export interface HumanNameFormatOptions {
  all?: boolean;
  prefix?: boolean;
  suffix?: boolean;
  use?: boolean;
}

export function formatAddress(address: Address, options?: AddressFormatOptions): string {
  const builder = [];

  if (address.line) {
    builder.push(...address.line);
  }

  if (address.city) {
    builder.push(address.city);
  }

  if (address.state) {
    builder.push(address.state);
  }

  if (address.postalCode) {
    builder.push(address.postalCode);
  }

  if (address.use && (options?.all || options?.use)) {
    builder.push('[' + address.use + ']');
  }

  return builder.join(', ').trim();
}

export function formatHumanName(name: HumanName, options?: HumanNameFormatOptions): string {
  const builder = [];

  if (name.prefix && options?.prefix !== false) {
    builder.push(...name.prefix);
  }

  if (name.given) {
    builder.push(...name.given);
  }

  if (name.family) {
    builder.push(name.family);
  }

  if (name.suffix && options?.suffix !== false) {
    builder.push(...name.suffix);
  }

  if (name.use && (options?.all || options?.use)) {
    builder.push('[' + name.use + ']');
  }

  return builder.join(' ').trim();
}

export function formatGivenName(name: HumanName): string {
  const builder: string[] = [];
  if (name.given) {
    builder.push(...name.given);
  }
  return builder.join(' ').trim();
}

export function formatFamilyName(name: HumanName): string {
  return name.family || '';
}

export function isValidDate(date: Date): boolean {
  return date instanceof Date && !isNaN(date.getTime());
}

export function formatDate(date: string | undefined, options?: Intl.DateTimeFormatOptions): string {
  if (!date) {
    return '';
  }
  const d = new Date(date);
  if (!isValidDate(d)) {
    return '';
  }
  return d.toLocaleDateString(undefined, options);
}

export function formatTime(time: string | undefined, options?: Intl.DateTimeFormatOptions): string {
  if (!time) {
    return '';
  }
  const d = new Date('2000-01-01T' + time + 'Z');
  if (!isValidDate(d)) {
    return '';
  }
  return d.toLocaleTimeString(undefined, options);
}

export function formatDateTime(dateTime: string | undefined, options?: Intl.DateTimeFormatOptions): string {
  if (!dateTime) {
    return '';
  }
  const d = new Date(dateTime);
  if (!isValidDate(d)) {
    return '';
  }
  return d.toLocaleString(undefined, options);
}

export function formatPeriod(period: Period | undefined): string {
  if (!period || (!period.start && !period.end)) {
    return '';
  }
  return formatDateTime(period.start) + ' - ' + formatDateTime(period.end);
}

const unitAdverbForm: Record<string, string> = {
  s: 'every second',
  min: 'every minute',
  h: 'hourly',
  d: 'daily',
  wk: 'weekly',
  mo: 'monthly',
  a: 'annually',
};

const singularUnits: Record<string, string> = {
  s: 'second',
  min: 'minute',
  h: 'hour',
  d: 'day',
  wk: 'week',
  mo: 'month',
  a: 'year',
};

const pluralUnits: Record<string, string> = {
  s: 'seconds',
  min: 'minutes',
  h: 'hours',
  d: 'days',
  wk: 'weeks',
  mo: 'months',
  a: 'years',
};

export function formatTiming(timing: Timing | undefined): string {
  if (!timing) {
    return '';
  }

  const builder: string[] = [];

  if (timing.repeat?.periodUnit) {
    const frequency = timing.repeat.frequency || 1;
    const period = timing.repeat.period || 1;
    const periodUnit = timing.repeat.periodUnit;

    if (frequency === 1 && period === 1) {
      builder.push(unitAdverbForm[periodUnit]);
    } else {
      if (frequency === 1) {
        builder.push('once');
      } else {
        builder.push(frequency + ' times');
      }

      if (period === 1) {
        builder.push('per ' + singularUnits[periodUnit]);
      } else {
        builder.push('per ' + period + ' ' + pluralUnits[periodUnit]);
      }
    }

    if (timing.repeat.dayOfWeek) {
      builder.push('on ' + timing.repeat.dayOfWeek.map(capitalize).join(', '));
    }

    if (timing.repeat.timeOfDay) {
      builder.push('at ' + timing.repeat.timeOfDay.map((t) => formatTime(t)).join(', '));
    }
  }

  if (timing.event) {
    builder.push(timing.event.map((d) => formatDateTime(d)).join(', '));
  }

  return capitalize(builder.join(' ').trim());
}

/**
 * Returns a human-readable string for a FHIR Range datatype, taking into account comparators and one-sided ranges
 * @param range A FHIR Range element
 * @param exclusive If true, one-sided ranges will be rendered with the '>' or '<' bounds rather than '>=' or '<='
 * @returns A human-readable string representation of the Range
 */
export function formatRange(range: Range | undefined, precision?: number, exclusive = false): string {
  if (exclusive && precision === undefined) {
    throw new Error('Precision must be specified for exclusive ranges');
  }

  const low = range?.low && { ...range.low };
  const high = range?.high && { ...range.high };
  if (!range || (low?.value === undefined && high?.value === undefined)) {
    return '';
  }

  if (range.low?.value !== undefined && range.high?.value === undefined) {
    if (exclusive && precision !== undefined) {
      range.low.value = preciseDecrement(range.low.value, precision);
      return `> ${formatQuantity(range.low, precision)}`;
    }
    return `>= ${formatQuantity(range.low, precision)}`;
  }

  if (range.low?.value === undefined && range.high?.value !== undefined) {
    if (exclusive && precision !== undefined) {
      range.high.value = preciseIncrement(range.high.value, precision);
      return `< ${formatQuantity(range.high, precision)}`;
    }
    return `<= ${formatQuantity(range.high, precision)}`;
  }

  if (low?.unit === high?.unit) {
    delete low?.unit;
  }
  return `${formatQuantity(low, precision)} - ${formatQuantity(high, precision)}`;
}

/**
 * Returns a human-readable string for a FHIR Quantity datatype, taking into account units and comparators
 * @param quantity A FHIR Quantity element
 * @returns A human-readable string representation of the Quantity
 */
export function formatQuantity(quantity: Quantity | undefined, precision?: number): string {
  if (!quantity) {
    return '';
  }

  const result = [];

  if (quantity.comparator) {
    result.push(quantity.comparator);
    result.push(' ');
  }

  if (quantity.value !== undefined) {
    if (precision !== undefined) {
      result.push(quantity.value.toFixed(precision));
    } else {
      result.push(quantity.value);
    }
  }

  if (quantity.unit) {
    if (quantity.unit !== '%' && result[result.length - 1] !== ' ') {
      result.push(' ');
    }
    result.push(quantity.unit);
  }

  return result.join('').trim();
}

/**
 * Returns the input number increased by the `n` units of the specified precision
 * @param a The input number
 * @param precision The precision in number of digits.
 * @param n (default 1) The number of units to add
 */
function preciseIncrement(a: number, precision: number, n = 1): number {
  return (toPreciseInteger(a, precision) + n) * Math.pow(10, -precision);
}

/**
 * Returns the input number decreased by the `n` units of the specified precision
 * @param a The input number
 * @param precision The precision in number of digits.
 * @param n (default 1) The number of units to subtract
 */
function preciseDecrement(a: number, precision: number, n = 1): number {
  return (toPreciseInteger(a, precision) - n) * Math.pow(10, -precision);
}

/**
 * Returns an integer representation of the number with the given precision.
 * For example, if precision is 2, then 1.2345 will be returned as 123.
 * @param a The number.
 * @param precision Optional precision in number of digits.
 * @returns The integer with the given precision.
 */
function toPreciseInteger(a: number, precision?: number): number {
  if (precision === undefined) {
    return a;
  }
  return Math.round(a * Math.pow(10, precision));
}
