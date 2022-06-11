import { formatAddress, formatFamilyName, formatGivenName, formatHumanName } from './format';

describe('Format', () => {
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
          use: 'official',
        },
        {
          use: true,
        }
      )
    ).toEqual('742 Evergreen Terrace, Springfield, OR, 97403, [official]');

    expect(
      formatAddress(
        {
          line: ['742 Evergreen Terrace'],
          city: 'Springfield',
          state: 'OR',
          postalCode: '97403',
          use: 'official',
        },
        {
          all: true,
        }
      )
    ).toEqual('742 Evergreen Terrace, Springfield, OR, 97403, [official]');
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
    ).toEqual('Alice Smith');

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
          prefix: true,
        }
      )
    ).toEqual('Ms. Alice Smith');

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
          suffix: true,
        }
      )
    ).toEqual('Alice Gelato Smith III');

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
    ).toEqual('Alice Gelato Smith [official]');

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
    ).toEqual('Alice Gelato Smith');

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
});
