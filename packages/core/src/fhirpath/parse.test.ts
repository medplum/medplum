import { readJson } from '@medplum/definitions';
import { Bundle, BundleEntry } from '../fhir/Bundle';
import { Observation } from '../fhir/Observation';
import { SearchParameter } from '../fhir/SearchParameter';
import { parse } from './parse';

test('Parser can build a arithmetic parser with correct order of operations', () => {
  const result = parse('3 / 3 + 4 * 3 ^ 2 - 1').eval(0);
  expect(result).toEqual(36);
});

test('Parser can build a arithmetic parser with parentheses', () => {
  const result = parse('3 / 3 + 4 * (3 ^ (2 - 1))').eval(0);
  expect(result).toEqual(13);
});

test('Parser can build a arithmetic parser with correct associativity', () => {
  const result = parse('5 - 4 - 3 - 2 - 1 + 2 ^ 3 ^ 2').eval(0);
  expect(result).toEqual(507);
});

test('Parser can build an arithmetic parser with prefix operators', () => {
  const result = parse('-4 + -(4 + 5 - -4)').eval(0);
  expect(result).toEqual(-17);
});

test('Parser throws on missing closing parentheses', () => {
  expect(() => parse('(2 + 1')).toThrowError('Parse error: expected `)`');
});

test('Parser throws on unexpected symbol', () => {
  expect(() => parse('*')).toThrowError('Parse error at *. No matching prefix parselet.');
});

test('Parser throws on missing tokens', () => {
  expect(() => parse('1 * ')).toThrowError('Cant consume any more tokens.');
});

test('Evaluate FHIRPath Patient.name.given on empty resource', () => {
  const result = parse('Patient.name.given').eval({});
  expect(result).toBeUndefined();
});

test('Evaluate FHIRPath Patient.name.given', () => {
  const result = parse('Patient.name.given').eval({
    resourceType: 'Patient',
    name: [{
      given: ['Alice'],
      family: 'Smith'
    }]
  });
  expect(result).toEqual(['Alice']);
});

test('Evaluate FHIRPath string concatenation', () => {
  const result = parse('Patient.name.given + \' \' + Patient.name.family').eval({
    resourceType: 'Patient',
    name: [{
      given: ['Alice'],
      family: 'Smith'
    }]
  });
  expect(result).toEqual('Alice Smith');
});

test('Evaluate FHIRPath Patient.name.given on array of resources', () => {
  const result = parse('Patient.name.given').eval([{
    resourceType: 'Patient',
    name: [{
      given: ['Alice'],
      family: 'Smith'
    }]
  },
  {
    resourceType: 'Patient',
    name: [{
      given: ['Bob'],
      family: 'Jones'
    }]
  }]);
  expect(result).toEqual(['Alice', 'Bob']);
});

test('Evaluate FHIRPath string concatenation on array of resources', () => {
  const result = parse('Patient.name.given + \' \' + Patient.name.family').eval([{
    resourceType: 'Patient',
    name: [{
      given: ['Alice'],
      family: 'Smith'
    }]
  },
  {
    resourceType: 'Patient',
    name: [{
      given: ['Bob'],
      family: 'Jones'
    }]
  }]);
  expect(result).toEqual(['Alice Smith', 'Bob Jones']);
});

test('Evaluate FHIRPath Patient.name.given on array of resources', () => {
  const result = parse('Patient.name.given').eval([{
    resourceType: 'Practitioner',
    name: [{
      given: ['Alice'],
      family: 'Smith'
    }]
  },
  {
    resourceType: 'Patient',
    name: [{
      given: ['Bob'],
      family: 'Jones'
    }]
  }]);
  expect(result).toEqual(['Bob']);
});

test('Evaluate FHIRPath union', () => {
  const result = parse('Practitioner.name.given | Patient.name.given').eval({
    resourceType: 'Patient',
    name: [{
      given: ['Alice'],
      family: 'Smith'
    }]
  });
  expect(result).toEqual(['Alice']);
});

test('Evaluate FHIRPath union to combine results', () => {
  const result = parse('Practitioner.name.given | Patient.name.given').eval([{
    resourceType: 'Patient',
    name: [{
      given: ['Alice'],
      family: 'Smith'
    }]
  },
  {
    resourceType: 'Practitioner',
    name: [{
      given: ['Bob'],
      family: 'Jones'
    }]
  }]);
  expect(result).toEqual(['Alice', 'Bob']);
});

test('Evaluate FHIRPath double union', () => {
  const result = parse('Patient.name.given | Patient.name.given').eval([{
    resourceType: 'Patient',
    name: [{
      given: ['Alice'],
      family: 'Smith'
    }]
  },
  {
    resourceType: 'Patient',
    name: [{
      given: ['Bob'],
      family: 'Jones'
    }]
  }]);
  expect(result).toEqual(['Alice', 'Alice', 'Bob', 'Bob']);
});

test('Evaluate ignores non-objects', () => {
  const result = parse('foo.bar').eval({
    foo: 1
  });
  expect(result).toBeUndefined();
});

test('Evaluate fails on function parentheses after non-symbol', () => {
  expect(() => parse('1()').eval(0)).toThrowError('Unexpected parentheses');
});

test('Evaluate fails on unrecognized function', () => {
  expect(() => parse('asdf()').eval(0)).toThrowError('Unrecognized function');
});

test('Evaluate FHIRPath where function', () => {
  const result = parse('Patient.telecom.where(system=\'email\')').eval({
    resourceType: 'Patient',
    name: [{
      given: ['Alice'],
      family: 'Smith'
    }],
    telecom: [
      {
        system: 'a',
        value: 'a'
      },
      {
        system: 'b',
        value: 'b'
      },
      {
        system: 'email',
        value: 'alice@example.com'
      },
      {
        system: 'c',
        value: 'c'
      },
    ]
  });
  expect(result).toMatchObject([{
    system: 'email',
    value: 'alice@example.com'
  }]);
});

test('Eval all SearchParameter expressions', () => {
  const searchParams = readJson('fhir/r4/search-parameters.json') as Bundle;
  for (const entry of searchParams.entry as BundleEntry[]) {
    const resource = entry.resource as SearchParameter;
    const { expression } = resource;
    if (expression) {
      expect(() => parse((expression))).not.toThrow();
    }
  }
});

test('Eval FHIRPath resolve function', () => {
  const observation: Observation = {
    resourceType: 'Observation',
    subject: {
      reference: 'Patient/123'
    }
  };

  const result = parse('Observation.subject.resolve()').eval(observation);

  expect(result).toMatchObject({
    resourceType: 'Patient',
    id: '123'
  });
});
