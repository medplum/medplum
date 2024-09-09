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
  formatTime,
  formatTiming,
} from './format';

test('Format Address', () => {
  expect(formatAddress({})).toEqual('');

  expect(
    formatAddress({
      line: ['742 Evergreen Terrace'],
    })
  ).toEqual('742 Evergreen Terrace');

  expect(
    formatAddress({
      city: 'Springfield',
    })
  ).toEqual('Springfield');

  expect(
    formatAddress({
      state: 'OR',
    })
  ).toEqual('OR');

  expect(
    formatAddress({
      postalCode: '97403',
    })
  ).toEqual('97403');

  expect(
    formatAddress({
      line: ['742 Evergreen Terrace'],
      city: 'Springfield',
      state: 'OR',
      postalCode: '97403',
    })
  ).toEqual('742 Evergreen Terrace, Springfield, OR, 97403');

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
  ).toEqual('742 Evergreen Terrace\nSpringfield, OR, 97403');

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
  ).toEqual('742 Evergreen Terrace, Springfield, OR, 97403');

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
  ).toEqual('742 Evergreen Terrace, Springfield, OR, 97403, [home]');

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
  ).toEqual('742 Evergreen Terrace, Springfield, OR, 97403, [home]');
});

test('Format HumanName', () => {
  expect(formatHumanName({})).toEqual('');

  expect(
    formatHumanName({
      given: ['Alice'],
      family: 'Smith',
      use: 'official',
    })
  ).toEqual('Alice Smith');

  expect(
    formatHumanName({
      prefix: ['Ms.'],
      given: ['Alice'],
      family: 'Smith',
    })
  ).toEqual('Ms. Alice Smith');

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
  ).toEqual('Ms. Alice Smith');

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
  ).toEqual('Alice Smith');

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
  ).toEqual('Ms. Alice Gelato Smith');

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
  ).toEqual('Ms. Alice Gelato Smith III [official]');

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
  ).toEqual('Ms. Alice Gelato Smith III');

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
  ).toEqual('Ms. Alice Gelato Smith III [official]');

  expect(formatHumanName({ text: 'foo bar' })).toEqual('foo bar');
});

test('Format given name', () => {
  expect(formatGivenName({})).toEqual('');
  expect(
    formatGivenName({
      given: ['Alice', 'Gelato'],
      family: 'Smith',
    })
  ).toEqual('Alice Gelato');
});

test('Format family name', () => {
  expect(formatFamilyName({})).toEqual('');
  expect(
    formatFamilyName({
      given: ['Alice', 'Gelato'],
      family: 'Smith',
    })
  ).toEqual('Smith');
});

test('Format date', () => {
  expect(formatDate(undefined)).toEqual('');
  expect(formatDate('')).toEqual('');
  expect(formatDate('xyz')).toEqual('');
  expect(formatDate('2021-06-01')).toEqual('6/1/2021');
});

test('Format time', () => {
  expect(formatTime(undefined)).toEqual('');
  expect(formatTime('')).toEqual('');
  expect(formatTime('xyz')).toEqual('');
  expect(formatTime('12:00')).not.toEqual('');
  expect(formatTime('12:00:00')).not.toEqual('');
});

test('Format date/time', () => {
  expect(formatDateTime(undefined)).toEqual('');
  expect(formatDateTime('')).toEqual('');
  expect(formatDateTime('xyz')).toEqual('');
  expect(formatDateTime('2021-06-01T12:00:00Z')).toMatch(/2021/);
});

test('Format period', () => {
  expect(formatPeriod(undefined)).toEqual('');
  expect(formatPeriod({})).toEqual('');
  expect(formatPeriod({ start: '2021-06-01T12:00:00Z', end: '2022-06-02T12:00:00Z' })).toMatch(/2021/);
});

test('Format timing', () => {
  expect(formatTiming(undefined)).toEqual('');
  expect(formatTiming({})).toEqual('');
  expect(formatTiming({ event: ['2021-06-01T12:00:00Z'] })).toMatch(/2021/);
  expect(formatTiming({ repeat: { periodUnit: 's' } })).toEqual('Every second');
  expect(formatTiming({ repeat: { periodUnit: 'min' } })).toEqual('Every minute');
  expect(formatTiming({ repeat: { periodUnit: 'd' } })).toEqual('Daily');
  expect(formatTiming({ repeat: { periodUnit: 'wk' } })).toEqual('Weekly');
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
  ).toEqual('Once per 3 hours');
  expect(
    formatTiming({
      repeat: {
        frequency: 2,
        periodUnit: 'h',
      },
    })
  ).toEqual('2 times per hour');
  expect(
    formatTiming({
      repeat: {
        frequency: 2,
        period: 3,
        periodUnit: 'h',
      },
    })
  ).toEqual('2 times per 3 hours');
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
  expect(formatCoding({ code: 'foo' })).toBe('foo');
  expect(formatCoding({ code: { foo: 'bar' } as unknown as string })).toBe('');
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
