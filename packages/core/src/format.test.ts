import { formatFamilyName, formatGivenName, formatHumanName } from './format';

test('Format HumanName', () => {
  expect(formatHumanName({
    given: ['Alice'],
    family: 'Smith',
    use: 'official'
  })).toEqual('Alice Smith');

  expect(formatHumanName({
    prefix: ['Ms.'],
    given: ['Alice'],
    family: 'Smith'
  })).toEqual('Alice Smith');

  expect(formatHumanName({
    prefix: ['Ms.'],
    given: ['Alice'],
    family: 'Smith'
  }, {
    all: true
  })).toEqual('Ms. Alice Smith');

  expect(formatHumanName({
    prefix: ['Ms.'],
    given: ['Alice'],
    family: 'Smith'
  }, {
    prefix: true
  })).toEqual('Ms. Alice Smith');

  expect(formatHumanName({
    prefix: ['Ms.'],
    given: ['Alice', 'Gelato'],
    family: 'Smith',
    suffix: ['III'],
    use: 'official'
  }, {
    suffix: true
  })).toEqual('Alice Gelato Smith III');

  expect(formatHumanName({
    prefix: ['Ms.'],
    given: ['Alice', 'Gelato'],
    family: 'Smith',
    suffix: ['III'],
    use: 'official'
  }, {
    use: true
  })).toEqual('Alice Gelato Smith [official]');

  expect(formatHumanName({
    prefix: ['Ms.'],
    given: ['Alice', 'Gelato'],
    family: 'Smith',
    suffix: ['III']
  }, {
    use: true
  })).toEqual('Alice Gelato Smith');

  expect(formatHumanName({
    prefix: ['Ms.'],
    given: ['Alice', 'Gelato'],
    family: 'Smith',
    suffix: ['III'],
    use: 'official'
  }, {
    all: true
  })).toEqual('Ms. Alice Gelato Smith III [official]');
});

test('Format given name', () => {
  expect(formatGivenName({})).toEqual('');
  expect(formatGivenName({
    given: ['Alice', 'Gelato'],
    family: 'Smith'
  })).toEqual('Alice Gelato');
});

test('Format family name', () => {
  expect(formatFamilyName({})).toEqual('');
  expect(formatFamilyName({
    given: ['Alice', 'Gelato'],
    family: 'Smith'
  })).toEqual('Smith');
});
