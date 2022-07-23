import { Address, HumanName, Period, Timing } from '@medplum/fhirtypes';
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

  if (name.prefix && (options?.all || options?.prefix)) {
    builder.push(...name.prefix);
  }

  if (name.given) {
    builder.push(...name.given);
  }

  if (name.family) {
    builder.push(name.family);
  }

  if (name.suffix && (options?.all || options?.suffix)) {
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
