// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { Observation } from '@medplum/fhirtypes';
import { LOINC, UCUM } from './constants';
import {
  formatAddress,
  formatCodeableConcept,
  formatCoding,
  formatDate,
  formatDateTime,
  formatFamilyName,
  formatGivenName,
  formatHumanName,
  formatMoney,
  formatObservationValue,
  formatPeriod,
  formatQuantity,
  formatRange,
  formatReferenceString,
  formatTime,
  formatTiming,
  typedValueToString,
} from './format';

describe('typedValueToString', () => {
  expect(typedValueToString(undefined)).toStrictEqual('');
  expect(typedValueToString({ type: 'Address', value: { city: 'x' } })).toStrictEqual('x');
  expect(typedValueToString({ type: 'CodeableConcept', value: { text: 'x' } })).toStrictEqual('x');
  expect(typedValueToString({ type: 'Coding', value: { code: 'x' } })).toStrictEqual('x');
  expect(typedValueToString({ type: 'ContactPoint', value: { value: 'x' } })).toStrictEqual('x');
  expect(typedValueToString({ type: 'HumanName', value: { given: ['x'] } })).toStrictEqual('x');
  expect(typedValueToString({ type: 'Quantity', value: { value: 1, unit: 'kg' } })).toStrictEqual('1 kg');
  expect(typedValueToString({ type: 'Reference', value: { reference: 'Patient/x' } })).toStrictEqual('Patient/x');
  expect(typedValueToString({ type: 'string', value: 'x' })).toStrictEqual('x');
  expect(typedValueToString({ type: 'boolean', value: true })).toStrictEqual('true');
  expect(typedValueToString({ type: 'boolean', value: false })).toStrictEqual('false');
  expect(typedValueToString({ type: 'boolean', value: undefined })).toStrictEqual('');
});

test('formatReferenceString', () => {
  expect(formatReferenceString(undefined)).toStrictEqual('');
  expect(formatReferenceString({})).toStrictEqual('');
  expect(formatReferenceString({ reference: 'Patient/123', display: 'Patient 123' })).toStrictEqual('Patient 123');
  expect(formatReferenceString({ reference: 'Patient/123', display: undefined })).toStrictEqual('Patient/123');
  expect(formatReferenceString({ reference: undefined, display: undefined, id: '123' })).toStrictEqual('{"id":"123"}');
});

test('Format Address', () => {
  expect(formatAddress(undefined)).toStrictEqual('');
  expect(formatAddress(null as unknown as undefined)).toStrictEqual('');
  expect(formatAddress({})).toStrictEqual('');

  expect(
    formatAddress({
      line: ['742 Evergreen Terrace'],
    })
  ).toStrictEqual('742 Evergreen Terrace');

  expect(
    formatAddress({
      city: 'Springfield',
    })
  ).toStrictEqual('Springfield');

  expect(
    formatAddress({
      state: 'OR',
    })
  ).toStrictEqual('OR');

  expect(
    formatAddress({
      postalCode: '97403',
    })
  ).toStrictEqual('97403');

  expect(
    formatAddress({
      line: ['742 Evergreen Terrace'],
      city: 'Springfield',
      state: 'OR',
      postalCode: '97403',
    })
  ).toStrictEqual('742 Evergreen Terrace, Springfield, OR, 97403');

  expect(
    formatAddress(
      {
        line: ['742 Evergreen Terrace'],
        city: 'Springfield',
        state: 'OR',
        postalCode: '97403',
      },
      {
        lineSeparator: '\n',
      }
    )
  ).toStrictEqual('742 Evergreen Terrace\nSpringfield, OR, 97403');

  expect(
    formatAddress(
      {
        line: ['742 Evergreen Terrace'],
        city: 'Springfield',
        state: 'OR',
        postalCode: '97403',
      },
      {
        use: true,
      }
    )
  ).toStrictEqual('742 Evergreen Terrace, Springfield, OR, 97403');

  expect(
    formatAddress(
      {
        line: ['742 Evergreen Terrace'],
        city: 'Springfield',
        state: 'OR',
        postalCode: '97403',
        use: 'home',
      },
      {
        use: true,
      }
    )
  ).toStrictEqual('742 Evergreen Terrace, Springfield, OR, 97403, [home]');

  expect(
    formatAddress(
      {
        line: ['742 Evergreen Terrace'],
        city: 'Springfield',
        state: 'OR',
        postalCode: '97403',
        use: 'home',
      },
      {
        all: true,
      }
    )
  ).toStrictEqual('742 Evergreen Terrace, Springfield, OR, 97403, [home]');
});

test('Format HumanName', () => {
  expect(formatHumanName(undefined)).toStrictEqual('');
  expect(formatHumanName(null as unknown as undefined)).toStrictEqual('');
  expect(formatHumanName({})).toStrictEqual('');

  expect(
    formatHumanName({
      given: ['Alice'],
      family: 'Smith',
      use: 'official',
    })
  ).toStrictEqual('Alice Smith');

  expect(
    formatHumanName({
      prefix: ['Ms.'],
      given: ['Alice'],
      family: 'Smith',
    })
  ).toStrictEqual('Ms. Alice Smith');

  expect(
    formatHumanName(
      {
        prefix: ['Ms.'],
        given: ['Alice'],
        family: 'Smith',
      },
      {
        all: true,
      }
    )
  ).toStrictEqual('Ms. Alice Smith');

  expect(
    formatHumanName(
      {
        prefix: ['Ms.'],
        given: ['Alice'],
        family: 'Smith',
      },
      {
        prefix: false,
      }
    )
  ).toStrictEqual('Alice Smith');

  expect(
    formatHumanName(
      {
        prefix: ['Ms.'],
        given: ['Alice', 'Gelato'],
        family: 'Smith',
        suffix: ['III'],
        use: 'official',
      },
      {
        suffix: false,
      }
    )
  ).toStrictEqual('Ms. Alice Gelato Smith');

  expect(
    formatHumanName(
      {
        prefix: ['Ms.'],
        given: ['Alice', 'Gelato'],
        family: 'Smith',
        suffix: ['III'],
        use: 'official',
      },
      {
        use: true,
      }
    )
  ).toStrictEqual('Ms. Alice Gelato Smith III [official]');

  expect(
    formatHumanName(
      {
        prefix: ['Ms.'],
        given: ['Alice', 'Gelato'],
        family: 'Smith',
        suffix: ['III'],
      },
      {
        use: true,
      }
    )
  ).toStrictEqual('Ms. Alice Gelato Smith III');

  expect(
    formatHumanName(
      {
        prefix: ['Ms.'],
        given: ['Alice', 'Gelato'],
        family: 'Smith',
        suffix: ['III'],
        use: 'official',
      },
      {
        all: true,
      }
    )
  ).toStrictEqual('Ms. Alice Gelato Smith III [official]');

  expect(formatHumanName({ text: 'foo bar' })).toStrictEqual('foo bar');
});

test('Format given name', () => {
  expect(formatGivenName({})).toStrictEqual('');
  expect(
    formatGivenName({
      given: ['Alice', 'Gelato'],
      family: 'Smith',
    })
  ).toStrictEqual('Alice Gelato');
});

test('Format family name', () => {
  expect(formatFamilyName({})).toStrictEqual('');
  expect(
    formatFamilyName({
      given: ['Alice', 'Gelato'],
      family: 'Smith',
    })
  ).toStrictEqual('Smith');
});

test('Format date', () => {
  expect(formatDate(undefined)).toStrictEqual('');
  expect(formatDate('')).toStrictEqual('');
  expect(formatDate('xyz')).toStrictEqual('');
  expect(formatDate('2021-06-01')).toStrictEqual('6/1/2021');
});

test('Format time', () => {
  expect(formatTime(undefined)).toStrictEqual('');
  expect(formatTime('')).toStrictEqual('');
  expect(formatTime('xyz')).toStrictEqual('');
  expect(formatTime('12:00')).not.toStrictEqual('');
  expect(formatTime('12:00:00')).not.toStrictEqual('');
});

test('Format date/time', () => {
  expect(formatDateTime(undefined)).toStrictEqual('');
  expect(formatDateTime('')).toStrictEqual('');
  expect(formatDateTime('xyz')).toStrictEqual('');
  expect(formatDateTime('2021-06-01T12:00:00Z')).toMatch(/2021/);
});

test('Format period', () => {
  expect(formatPeriod(undefined)).toStrictEqual('');
  expect(formatPeriod({})).toStrictEqual('');
  expect(formatPeriod({ start: '2021-06-01T12:00:00Z', end: '2022-06-02T12:00:00Z' })).toMatch(/2021/);
});

test('Format timing', () => {
  expect(formatTiming(undefined)).toStrictEqual('');
  expect(formatTiming({})).toStrictEqual('');
  expect(formatTiming({ event: ['2021-06-01T12:00:00Z'] })).toMatch(/2021/);
  expect(formatTiming({ repeat: { periodUnit: 's' } })).toStrictEqual('Every second');
  expect(formatTiming({ repeat: { periodUnit: 'min' } })).toStrictEqual('Every minute');
  expect(formatTiming({ repeat: { periodUnit: 'd' } })).toStrictEqual('Daily');
  expect(formatTiming({ repeat: { periodUnit: 'wk' } })).toStrictEqual('Weekly');
  expect(
    formatTiming({
      repeat: {
        periodUnit: 'wk',
        dayOfWeek: ['mon', 'wed', 'fri'],
        timeOfDay: ['09:00:00', '12:00:00', '03:00:00'],
      },
    })
  ).toMatch(/Weekly on Mon, Wed, Fri at/);
  expect(
    formatTiming({
      repeat: {
        period: 3,
        periodUnit: 'h',
      },
    })
  ).toStrictEqual('Once per 3 hours');
  expect(
    formatTiming({
      repeat: {
        frequency: 2,
        periodUnit: 'h',
      },
    })
  ).toStrictEqual('2 times per hour');
  expect(
    formatTiming({
      repeat: {
        frequency: 2,
        period: 3,
        periodUnit: 'h',
      },
    })
  ).toStrictEqual('2 times per 3 hours');
});

test('Format Range', () => {
  expect(formatRange(undefined)).toBe('');
  expect(formatRange({})).toBe('');
  expect(formatRange({ low: {}, high: {} })).toBe('');

  expect(formatRange({ low: { value: 0 }, high: { value: 0 } })).toBe('0 - 0');

  expect(formatRange({ low: { unit: 'mg/dL' } })).toBe('');
  expect(formatRange({ low: { value: 20 } })).toBe('>= 20');
  expect(formatRange({ low: { value: 20, unit: 'mg/dL' } })).toBe('>= 20 mg/dL');
  expect(formatRange({ low: { value: 20, unit: '%' } })).toBe('>= 20%');
  expect(formatRange({ low: { value: 20, unit: '%' } }, 1)).toBe('>= 20.0%');
  expect(formatRange({ low: { value: 20.0, unit: '%' } }, 0, true)).toBe('> 19%');
  expect(formatRange({ low: { value: 20.0, unit: '%' } }, 1, true)).toBe('> 19.9%');
  expect(formatRange({ low: { value: 20.0, unit: '%' } }, 2, true)).toBe('> 19.99%');

  expect(formatRange({ high: { unit: 'mg/dL' } })).toBe('');
  expect(formatRange({ high: { value: 20 } })).toBe('<= 20');
  expect(formatRange({ high: { value: 20, unit: 'mg/dL' } })).toBe('<= 20 mg/dL');
  expect(formatRange({ high: { value: 20, unit: '%' } })).toBe('<= 20%');
  expect(formatRange({ high: { value: 20, unit: '%' } }, 1)).toBe('<= 20.0%');
  expect(formatRange({ high: { value: 20.0, unit: '%' } }, 0, true)).toBe('< 21%');
  expect(formatRange({ high: { value: 20.0, unit: '%' } }, 1, true)).toBe('< 20.1%');
  expect(formatRange({ high: { value: 20.0, unit: '%' } }, 2, true)).toBe('< 20.01%');

  expect(formatRange({ low: { unit: 'mg/dL' }, high: { unit: 'mg/dL' } })).toBe('');
  expect(formatRange({ low: { value: 20 }, high: { value: 30 } })).toBe('20 - 30');
  expect(formatRange({ low: { value: 20, unit: 'mg/dL' }, high: { value: 30, unit: 'mg/dL' } })).toBe('20 - 30 mg/dL');
  expect(formatRange({ low: { value: 20, unit: '%' }, high: { value: 30, unit: '%' } })).toBe('20 - 30%');
  expect(formatRange({ low: { value: 0, unit: '%' }, high: { value: 100, unit: '%' } })).toBe('0 - 100%');

  // Edge case where quantity contains invalid comparator
  expect(formatRange({ high: { value: 20, unit: 'mg/dL', comparator: '<=' } })).toBe('<= 20 mg/dL');
});

test('Format Quantity', () => {
  expect(formatQuantity(undefined)).toBe('');
  expect(formatQuantity({})).toBe('');
  expect(formatQuantity({ value: 10.1, unit: 'pg/mL' })).toBe('10.1 pg/mL');
  expect(formatQuantity({ comparator: '>', value: 10.1, unit: 'pg/mL' })).toBe('> 10.1 pg/mL');
  expect(formatQuantity({ value: 10.1, unit: '%' })).toBe('10.1%');
  expect(formatQuantity({ comparator: '>', value: 10.1, unit: '%' })).toBe('> 10.1%');
  expect(formatQuantity({ comparator: '>', value: 10.1 })).toBe('> 10.1');

  // Test Precision
  expect(formatQuantity({ value: 10, unit: '%' }, 1)).toBe('10.0%');
  expect(formatQuantity({ value: 10, unit: '%' }, 3)).toBe('10.000%');

  // Edge cases with missing value
  expect(formatQuantity({ unit: 'pg/mL' })).toBe('pg/mL');
  expect(formatQuantity({ comparator: '<' })).toBe('<');
  expect(formatQuantity({ comparator: '<', unit: 'pg/mL' })).toBe('< pg/mL');
});

test('Format Money', () => {
  expect(formatMoney(undefined)).toBe('');
  expect(formatMoney({})).toBe('');
  expect(formatMoney({ value: 10.1 })).toBe('$10.10');
  expect(formatMoney({ value: 10.1, currency: 'USD' })).toBe('$10.10');
  expect(formatMoney({ value: 10.1, currency: 'EUR' })).toBe('€10.10');
  expect(formatMoney({ value: 1234567.89, currency: 'USD' })).toBe('$1,234,567.89');
});

test('Format CodeableConcept', () => {
  expect(formatCodeableConcept(undefined)).toBe('');
  expect(formatCodeableConcept({})).toBe('');
  expect(formatCodeableConcept({ text: 'foo' })).toBe('foo');
  expect(formatCodeableConcept({ coding: [{ display: 'foo' }] })).toBe('foo');
});

test('Format Coding', () => {
  expect(formatCoding(undefined)).toBe('');
  expect(formatCoding({})).toBe('');
  expect(formatCoding({ display: 'foo' })).toBe('foo');
  expect(formatCoding({ code: 'CODE' })).toBe('CODE');
  expect(formatCoding({ code: { foo: 'bar' } as unknown as string })).toBe('');

  // includeCode true
  expect(formatCoding(undefined, true)).toBe('');
  expect(formatCoding({}, true)).toBe('');
  expect(formatCoding({ display: 'foo', code: 'CODE' }, true)).toBe('foo (CODE)');
  expect(formatCoding({ display: 'foo' }, true)).toBe('foo');
  expect(formatCoding({ code: 'CODE' }, true)).toBe('CODE');
  expect(formatCoding({ code: { foo: 'bar' } as unknown as string }, true)).toBe('');
});

test('Format Observation value', () => {
  expect(formatObservationValue(undefined)).toBe('');
  expect(formatObservationValue({} as Observation)).toBe('');
  expect(formatObservationValue({ resourceType: 'Observation', valueString: 'foo' } as Observation)).toBe('foo');
  expect(
    formatObservationValue({ resourceType: 'Observation', valueCodeableConcept: { text: 'foo' } } as Observation)
  ).toBe('foo');
  expect(
    formatObservationValue({ resourceType: 'Observation', valueQuantity: { value: 123, unit: 'mg' } } as Observation)
  ).toBe('123 mg');
  expect(
    formatObservationValue({
      resourceType: 'Observation',
      component: [
        {
          code: { text: 'foo' },
          valueQuantity: {
            value: 110,
            unit: 'mmHg',
            system: UCUM,
          },
        },
        {
          code: { text: 'bar' },
          valueQuantity: {
            value: 75,
            unit: 'mmHg',
            system: UCUM,
          },
        },
      ],
    } as Observation)
  ).toBe('110 mmHg / 75 mmHg');
  expect(
    formatObservationValue({
      resourceType: 'Observation',
      code: { text: 'Body temperature' },
      valueQuantity: {
        value: 36.7,
        unit: 'C',
        code: 'Cel',
        system: UCUM,
      },
      component: [
        {
          code: { text: 'Body temperature measurement site' },
          valueCodeableConcept: {
            coding: [
              {
                display: 'Oral',
                code: 'LA9367-9',
                system: LOINC,
              },
            ],
          },
        },
      ],
    } as Observation)
  ).toBe('36.7 C / Oral');
});
