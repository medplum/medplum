/* eslint-disable header/header */
/*
 * Validation logic ported from cron-parser 5.10.2 (https://github.com/harrisiirak/cron-parser), the parser BullMQ uses
 * to schedule jobs. Only the parse-time checks are kept, which drops cron-parser's dependency on luxon.
 *
 * Copyright (c) 2014-2023 Harri Siirak
 *
 * Permission is hereby granted, free of charge, to any person obtaining a copy of this software and associated
 * documentation files (the "Software"), to deal in the Software without restriction, including without limitation the
 * rights to use, copy, modify, merge, publish, distribute, sublicense, and/or sell copies of the Software, and to
 * permit persons to whom the Software is furnished to do so, subject to the following conditions:
 *
 * The above copyright notice and this permission notice shall be included in all copies or substantial portions of the Software.
 *
 * THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE
 * WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR
 * COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR
 * OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.
 */

type CronValue = number | string;

interface CronFieldSpec {
  readonly min: number;
  readonly max: number;
  readonly chars: readonly string[];
  readonly validChars: RegExp;
  readonly aliases?: boolean;
  readonly dayOfWeek?: boolean;
}

const HASHED_CHARS = String.raw`|^.*H\(\d+-\d+\)\/\d+.*$|^.*H\(\d+-\d+\).*$|^.*H\/\d+.*$`;
const DEFAULT_VALID_CHARS = new RegExp(String.raw`^[?,*\dH/-]+$` + HASHED_CHARS);

const SECOND: CronFieldSpec = { min: 0, max: 59, chars: [], validChars: DEFAULT_VALID_CHARS };
const MINUTE: CronFieldSpec = SECOND;
const HOUR: CronFieldSpec = { min: 0, max: 23, chars: [], validChars: DEFAULT_VALID_CHARS };
const DAY_OF_MONTH: CronFieldSpec = {
  min: 1,
  max: 31,
  chars: ['L'],
  validChars: new RegExp(String.raw`^[?,*\dLH/-]+$` + HASHED_CHARS),
};
const MONTH: CronFieldSpec = { min: 1, max: 12, chars: [], validChars: DEFAULT_VALID_CHARS, aliases: true };
const DAY_OF_WEEK: CronFieldSpec = {
  min: 0,
  max: 7,
  chars: ['L'],
  validChars: new RegExp(String.raw`^[?,*\dLH#/-]+$` + HASHED_CHARS),
  aliases: true,
  dayOfWeek: true,
};

const DAYS_IN_MONTH = [31, 29, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];

const ALIASES: Record<string, number> = {
  jan: 1,
  feb: 2,
  mar: 3,
  apr: 4,
  may: 5,
  jun: 6,
  jul: 7,
  aug: 8,
  sep: 9,
  oct: 10,
  nov: 11,
  dec: 12,
  sun: 0,
  mon: 1,
  tue: 2,
  wed: 3,
  thu: 4,
  fri: 5,
  sat: 6,
};

const PREDEFINED_EXPRESSIONS: Record<string, string> = {
  '@yearly': '0 0 0 1 1 *',
  '@annually': '0 0 0 1 1 *',
  '@monthly': '0 0 0 1 * *',
  '@weekly': '0 0 0 * * 0',
  '@daily': '0 0 0 * * *',
  '@hourly': '0 0 * * * *',
  '@minutely': '0 * * * * *',
  '@secondly': '* * * * * *',
  '@weekdays': '0 0 0 * * 1-5',
  '@weekends': '0 0 0 * * 0,6',
};

const MAX_FIELD_VALUES = 256;
const MAX_EXPRESSION_LENGTH = 1024;

/**
 * Returns true if the input is a cron expression the Medplum job scheduler can run.
 *
 * Accepts exactly what cron-parser accepts in its default, non-strict mode: five or six fields (seconds first when
 * six), the `@daily`-style shorthands, month and weekday names, and the `L`, `#`, `?`, and `H` extensions.
 * @param cronString - The cron expression to check.
 * @returns True if the cron expression is valid.
 */
export function isValidCronString(cronString: string): boolean {
  try {
    parseCronExpression(cronString);
    return true;
  } catch {
    return false;
  }
}

function parseCronExpression(input: string): void {
  const expression = PREDEFINED_EXPRESSIONS[input] ?? (input || '0 * * * * *');
  if (expression.length > MAX_EXPRESSION_LENGTH) {
    throw new Error('Expression too long');
  }

  const atoms = expression.trim().split(/\s+/);
  if (atoms.length > 6) {
    throw new Error('Too many fields');
  }
  const [rawSecond, rawMinute, rawHour, rawDayOfMonth, rawMonth, rawDayOfWeek] = [
    ...['0', '*', '*', '*', '*', '*'].slice(0, 6 - atoms.length),
    ...atoms,
  ];

  const second = parseField(rawSecond, SECOND);
  const minute = parseField(rawMinute, MINUTE);
  const hour = parseField(rawHour, HOUR);
  const month = parseField(rawMonth, MONTH);
  let dayOfMonth = parseField(rawDayOfMonth, DAY_OF_MONTH);
  const dayOfWeek = parseField(parseNthDayOfWeek(rawDayOfWeek), DAY_OF_WEEK);

  // A single month drops the days it lacks, unless that would leave none
  if (month.length === 1) {
    const days = dayOfMonth.filter((value) => typeof value !== 'number' || value <= DAYS_IN_MONTH[+month[0] - 1]);
    dayOfMonth = days.length > 0 ? days : dayOfMonth;
  }

  for (const [values, spec] of [
    [second, SECOND],
    [minute, MINUTE],
    [hour, HOUR],
    [dayOfMonth, DAY_OF_MONTH],
    [month, MONTH],
    [dayOfWeek, DAY_OF_WEEK],
  ] as const) {
    validateFieldValues(values, spec);
  }
  if (dayOfWeek.includes('L')) {
    throw new Error('Standalone L in day of week');
  }

  // An explicit day of month that never occurs in the only month is unschedulable, unless day of week rescues it
  const hasLastDay = rawDayOfMonth.includes('L') || dayOfMonth.includes('L');
  const dayOfWeekIsWildcard = rawDayOfWeek === '*' || rawDayOfWeek === '?';
  if (month.length === 1 && !hasLastDay && dayOfWeekIsWildcard) {
    // Without L, every day of month is a number
    if (!(Math.min(...dayOfMonth.map(Number)) <= DAYS_IN_MONTH[+month[0] - 1])) {
      throw new Error('Invalid explicit day of month');
    }
  }
}

function parseField(raw: string, spec: CronFieldSpec): CronValue[] {
  let value = raw;
  if (spec.aliases) {
    value = value.replaceAll(/[a-z]{3}/gi, (match) => {
      const replacement = ALIASES[match.toLowerCase()];
      if (replacement === undefined) {
        throw new Error(`Unknown alias ${match}`);
      }
      return replacement.toString();
    });
  }
  if (!spec.validChars.test(value)) {
    throw new Error('Invalid characters');
  }
  value = value.replaceAll(/[*?]/g, `${spec.min}-${spec.max}`);
  value = parseHashed(value, spec);
  return parseSequence(value, spec);
}

/**
 * Expands `H` (hashed) values. cron-parser picks them at random, so a fixed draw keeps validation deterministic;
 * apart from lists whose hashed values may or may not collide, the draw cannot change whether an expression is valid.
 * @param value - The field value.
 * @param spec - The field being parsed.
 * @returns The field value with each hashed term replaced by concrete values.
 */
function parseHashed(value: string, spec: CronFieldSpec): string {
  let count = 0;
  return value.replaceAll(/H(?:\((\d+)-(\d+)\))?(?:\/(\d+))?/g, (_, min?: string, max?: string, step?: string) => {
    let rangeMin = spec.min;
    let rangeMax = spec.max;
    if (min && max) {
      const minNum = Number.parseInt(min, 10);
      const maxNum = Number.parseInt(max, 10);
      if (minNum > maxNum) {
        throw new Error('Invalid hashed range');
      }
      rangeMin = Math.max(minNum, spec.min);
      rangeMax = Math.min(maxNum, spec.max);
      if (rangeMin > rangeMax) {
        throw new Error('Hashed range outside field');
      }
    }
    if (!step) {
      return String(rangeMin);
    }

    const stepNum = Number.parseInt(step, 10);
    if (stepNum <= 0) {
      throw new Error('Invalid hashed step');
    }
    count += Math.ceil((rangeMax - rangeMin + 1) / stepNum);
    assertMaxFieldValues(count);
    const values: number[] = [];
    for (let i = Math.floor(rangeMin / stepNum) * stepNum; i <= rangeMax; i += stepNum) {
      if (i >= rangeMin) {
        values.push(i);
      }
    }
    return values.length > 0 ? values.join(',') : String(rangeMin);
  });
}

function parseSequence(value: string, spec: CronFieldSpec): CronValue[] {
  const stack: CronValue[] = [];
  for (const atom of value.split(',')) {
    assertMaxFieldValues(stack.length);
    if (atom.length === 0) {
      throw new Error('Empty list value');
    }
    const result = parseRepeat(atom, spec);
    if (Array.isArray(result)) {
      stack.push(...result);
    } else if (spec.chars.some((char) => result.toString().includes(char))) {
      stack.push(result);
    } else {
      const v = Number.parseInt(result.toString(), 10);
      if (!(v >= spec.min && v <= spec.max)) {
        throw new Error('Value out of range');
      }
      stack.push(spec.dayOfWeek ? v % 7 : result);
    }
  }
  return stack;
}

function parseRepeat(value: string, spec: CronFieldSpec): CronValue | CronValue[] {
  const atoms = value.split('/');
  if (atoms.length > 2) {
    throw new Error('Invalid repeat');
  }
  if (atoms.length === 2) {
    const range = atoms[0].includes('-') ? atoms[0] : `${atoms[0]}-${spec.max}`;
    return parseRange(range, Number.parseInt(atoms[1], 10), spec);
  }
  return parseRange(value, 1, spec);
}

function parseRange(value: string, repeatInterval: number, spec: CronFieldSpec): CronValue | CronValue[] {
  const atoms = value.split('-');
  if (atoms.length <= 1) {
    return Number.isNaN(+value) ? value : +value;
  }

  const [min, max] = atoms.map((num) => Number.parseInt(num, 10));
  if (!(min >= spec.min && max <= spec.max) || min > max) {
    throw new Error('Invalid range');
  }
  if (!(repeatInterval > 0)) {
    throw new Error('Invalid repeat interval');
  }

  const stack: number[] = [];
  if (spec.dayOfWeek && max % 7 === 0 && (max - min) % repeatInterval === 0) {
    stack.push(0);
  }
  for (let i = min; i <= max; i += repeatInterval) {
    if (!stack.includes(i)) {
      stack.push(i);
    }
  }
  return stack;
}

function parseNthDayOfWeek(value: string): string {
  const atoms = value.split('#');
  if (atoms.length <= 1) {
    return value;
  }
  const nth = +atoms[atoms.length - 1];
  if (/[,\-/]/.test(value) || atoms.length > 2 || !(nth >= 1 && nth <= 5)) {
    throw new Error('Invalid nth day of week');
  }
  return atoms[0];
}

function validateFieldValues(values: CronValue[], spec: CronFieldSpec): void {
  for (const value of values) {
    const valid =
      typeof value === 'number'
        ? value >= spec.min && value <= spec.max
        : spec.chars.some((char) => new RegExp(String.raw`^\d{0,2}${char}$`).test(value));
    if (!valid) {
      throw new Error('Value out of range');
    }
  }
  if (new Set(values).size !== values.length) {
    throw new Error('Duplicate values');
  }
}

function assertMaxFieldValues(count: number): void {
  if (count > MAX_FIELD_VALUES) {
    throw new Error('Too many values');
  }
}
