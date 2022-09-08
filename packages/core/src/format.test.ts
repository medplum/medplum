import {
  formatAddress,
  formatDate,
  formatDateTime,
  formatFamilyName,
  formatGivenName,
  formatHumanName,
  formatPeriod,
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
  expect(formatDate('2021-06-01')).toMatch(/2021/);
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
