import { readJson } from '@medplum/definitions';
import { AuditEvent, Bundle, BundleEntry, Observation, SearchParameter } from '@medplum/fhirtypes';
import { evalFhirPath, parseFhirPath } from './parse';

describe('FHIRPath parser', () => {
  test('Parser can build a arithmetic parser with correct order of operations', () => {
    const result = evalFhirPath('3 / 3 + 4 * 9 - 1', 0);
    expect(result).toEqual([36]);
  });

  test('Parser can build a arithmetic parser with parentheses', () => {
    const result = evalFhirPath('(3 / 3 + 4 * 3)', 0);
    expect(result).toEqual([13]);
  });

  test('Parser can build a arithmetic parser with correct associativity', () => {
    const result = evalFhirPath('5 - 4 - 3 - 2 - 1 + 512', 0);
    expect(result).toEqual([507]);
  });

  test('Parser can build an arithmetic parser with prefix operators', () => {
    const result = evalFhirPath('-4 + -(4 + 5 - -4)', 0);
    expect(result).toEqual([-17]);
  });

  test('Parser throws on missing closing parentheses', () => {
    expect(() => parseFhirPath('(2 + 1')).toThrowError('Parse error: expected `)`');
  });

  test('Parser throws on unexpected symbol', () => {
    expect(() => parseFhirPath('*')).toThrowError('Parse error at *. No matching prefix parselet.');
  });

  test('Parser throws on missing tokens', () => {
    expect(() => parseFhirPath('1 * ')).toThrowError('Cant consume unknown more tokens.');
  });

  test('Function minus number', () => {
    expect(evalFhirPath("'Peter'.length()-3", 0)).toEqual([2]);
  });

  test('Evaluate FHIRPath Patient.name.given on empty resource', () => {
    const result = evalFhirPath('Patient.name.given', {});
    expect(result).toEqual([]);
  });

  test('Evaluate FHIRPath Patient.name.given', () => {
    const result = evalFhirPath('Patient.name.given', {
      resourceType: 'Patient',
      name: [
        {
          given: ['Alice'],
          family: 'Smith',
        },
      ],
    });
    expect(result).toEqual(['Alice']);
  });

  test('Evaluate FHIRPath string concatenation', () => {
    const result = evalFhirPath("Patient.name.given + ' ' + Patient.name.family", {
      resourceType: 'Patient',
      name: [
        {
          given: ['Alice'],
          family: 'Smith',
        },
      ],
    });
    expect(result).toEqual(['Alice Smith']);
  });

  test('Evaluate FHIRPath Patient.name.given on array of resources', () => {
    const result = evalFhirPath('Patient.name.given', [
      {
        resourceType: 'Patient',
        name: [
          {
            given: ['Alice'],
            family: 'Smith',
          },
        ],
      },
      {
        resourceType: 'Patient',
        name: [
          {
            given: ['Bob'],
            family: 'Jones',
          },
        ],
      },
    ]);
    expect(result).toEqual(['Alice', 'Bob']);
  });

  test('Evaluate FHIRPath Patient.name[1].given', () => {
    const result = evalFhirPath('Patient.name[1].given', [
      {
        resourceType: 'Patient',
        name: [
          {
            given: ['Bob'],
            family: 'Jones',
          },
          {
            given: ['Robert'],
            family: 'Jones',
          },
        ],
      },
    ]);
    expect(result).toEqual(['Robert']);
  });

  test('Evaluate FHIRPath Patient.name[ (10 - 8) / 2].given', () => {
    const result = evalFhirPath('Patient.name[ (10 - 8) / 2].given', [
      {
        resourceType: 'Patient',
        name: [
          {
            given: ['Bob'],
            family: 'Jones',
          },
          {
            given: ['Robert'],
            family: 'Jones',
          },
        ],
      },
    ]);
    expect(result).toEqual(['Robert']);
  });

  test('Evaluate FHIRPath Patient.name.select(given[0])', () => {
    const result = evalFhirPath('Patient.name.select(given[0])', [
      {
        resourceType: 'Patient',
        name: [
          {
            given: ['Bob', 'A'],
            family: 'Jones',
          },
          {
            given: ['Robert', 'Adam'],
            family: 'Jones',
          },
        ],
      },
    ]);
    expect(result).toEqual(['Bob', 'Robert']);
  });

  test('Evaluate FHIRPath Patient.name.select(given[1])', () => {
    const result = evalFhirPath('Patient.name.select(given[1])', [
      {
        resourceType: 'Patient',
        name: [
          {
            given: ['Bob'],
            family: 'Jones',
          },
          {
            given: ['Robert', 'Adam'],
            family: 'Jones',
          },
        ],
      },
    ]);
    expect(result).toEqual(['Adam']);
  });

  test('Evaluate FHIRPath string concatenation on array of resources', () => {
    const result = evalFhirPath("Patient.name.given + ' ' + Patient.name.family", [
      {
        resourceType: 'Patient',
        name: [
          {
            given: ['Alice'],
            family: 'Smith',
          },
        ],
      },
      {
        resourceType: 'Patient',
        name: [
          {
            given: ['Bob'],
            family: 'Jones',
          },
        ],
      },
    ]);
    expect(result).toEqual(['Alice Smith', 'Bob Jones']);
  });

  test('Evaluate FHIRPath Patient.name.given on array of resources', () => {
    const result = evalFhirPath('Patient.name.given', [
      {
        resourceType: 'Practitioner',
        name: [
          {
            given: ['Alice'],
            family: 'Smith',
          },
        ],
      },
      {
        resourceType: 'Patient',
        name: [
          {
            given: ['Bob'],
            family: 'Jones',
          },
        ],
      },
    ]);
    expect(result).toEqual(['Bob']);
  });

  test('Evaluate FHIRPath union', () => {
    const result = evalFhirPath('Practitioner.name.given | Patient.name.given', {
      resourceType: 'Patient',
      name: [
        {
          given: ['Alice'],
          family: 'Smith',
        },
      ],
    });
    expect(result).toEqual(['Alice']);
  });

  test('Evaluate FHIRPath union to combine results', () => {
    const result = evalFhirPath('Practitioner.name.given | Patient.name.given', [
      {
        resourceType: 'Patient',
        name: [
          {
            given: ['Alice'],
            family: 'Smith',
          },
        ],
      },
      {
        resourceType: 'Practitioner',
        name: [
          {
            given: ['Bob'],
            family: 'Jones',
          },
        ],
      },
    ]);
    expect(result).toEqual(['Alice', 'Bob']);
  });

  test('Evaluate FHIRPath double union', () => {
    const result = evalFhirPath('Patient.name.given | Patient.name.given', [
      {
        resourceType: 'Patient',
        name: [
          {
            given: ['Alice'],
            family: 'Smith',
          },
        ],
      },
      {
        resourceType: 'Patient',
        name: [
          {
            given: ['Bob'],
            family: 'Jones',
          },
        ],
      },
    ]);
    expect(result).toEqual(['Alice', 'Bob']);
  });

  test('Evaluate ignores non-objects', () => {
    const result = evalFhirPath('foo.bar', {
      foo: 1,
    });
    expect(result).toEqual([]);
  });

  test('Evaluate fails on function parentheses after non-symbol', () => {
    expect(() => evalFhirPath('1()', 0)).toThrowError('Unexpected parentheses');
  });

  test('Evaluate fails on unrecognized function', () => {
    expect(() => evalFhirPath('asdf()', 0)).toThrowError('Unrecognized function');
  });

  test('Evaluate FHIRPath where function', () => {
    const result = evalFhirPath("Patient.telecom.where(system='email')", {
      resourceType: 'Patient',
      name: [
        {
          given: ['Alice'],
          family: 'Smith',
        },
      ],
      telecom: [
        {
          system: 'a',
          value: 'a',
        },
        {
          system: 'b',
          value: 'b',
        },
        {
          system: 'email',
          value: 'alice@example.com',
        },
        {
          system: 'c',
          value: 'c',
        },
      ],
    });
    expect(result).toMatchObject([
      {
        system: 'email',
        value: 'alice@example.com',
      },
    ]);
  });

  test('Eval all SearchParameter expressions', () => {
    const searchParams = readJson('fhir/r4/search-parameters.json') as Bundle;
    for (const entry of searchParams.entry as BundleEntry[]) {
      const resource = entry.resource as SearchParameter;
      const { expression } = resource;
      if (expression) {
        expect(() => parseFhirPath(expression)).not.toThrow();
      }
    }
  });

  test('Eval FHIRPath resolve function', () => {
    const observation: Observation = {
      resourceType: 'Observation',
      subject: {
        reference: 'Patient/123',
      },
    };

    const result = evalFhirPath('Observation.subject.resolve()', observation);

    expect(result).toMatchObject([
      {
        resourceType: 'Patient',
        id: '123',
      },
    ]);
  });

  test('Resolve is resourceType', () => {
    const auditEvent: AuditEvent = {
      resourceType: 'AuditEvent',
      entity: [
        {
          what: {
            reference: 'Patient/123',
          },
        },
      ],
    };

    const result = evalFhirPath('AuditEvent.entity.what.where(resolve() is Patient)', auditEvent);
    expect(result).toEqual([{ reference: 'Patient/123' }]);
  });

  test('Resolve is not resourceType', () => {
    const auditEvent: AuditEvent = {
      resourceType: 'AuditEvent',
      entity: [
        {
          what: {
            reference: 'Subscription/123',
          },
        },
      ],
    };

    const result = evalFhirPath('AuditEvent.entity.what.where(resolve() is Patient)', auditEvent);
    expect(result).toEqual([]);
  });
});
