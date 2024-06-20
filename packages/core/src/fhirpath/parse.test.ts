import { readJson } from '@medplum/definitions';
import { Bundle, BundleEntry, Encounter, Observation, Patient, SearchParameter } from '@medplum/fhirtypes';
import { PropertyType } from '../types';
import { indexStructureDefinitionBundle } from '../typeschema/types';
import { evalFhirPath, evalFhirPathTyped, parseFhirPath } from './parse';
import { toTypedValue } from './utils';

describe('FHIRPath parser', () => {
  beforeAll(() => {
    indexStructureDefinitionBundle(readJson('fhir/r4/profiles-types.json') as Bundle);
    indexStructureDefinitionBundle(readJson('fhir/r4/profiles-resources.json') as Bundle);
  });

  test('Parser can build a arithmetic parser with correct order of operations', () => {
    const result = evalFhirPath('3 / 3 + 4 * 9 - 1', []);
    expect(result).toEqual([36]);
  });

  test('Parser can build a arithmetic parser with parentheses', () => {
    const result = evalFhirPath('(3 / 3 + 4 * 3)', []);
    expect(result).toEqual([13]);
  });

  test('Parser can build a arithmetic parser with correct associativity', () => {
    const result = evalFhirPath('5 - 4 - 3 - 2 - 1 + 512', []);
    expect(result).toEqual([507]);
  });

  test('Parser can build an arithmetic parser with prefix operators', () => {
    const result = evalFhirPath('-4 + -(4 + 5 - -4)', []);
    expect(result).toEqual([-17]);
  });

  test('Parser throws on missing closing parentheses', () => {
    expect(() => parseFhirPath('(2 + 1')).toThrow('Parse error: expected `)`');
  });

  test('Parser throws on unexpected symbol', () => {
    expect(() => parseFhirPath('*')).toThrow('Parse error at "*" (line 1, column 0). No matching prefix parselet.');
  });

  test('Parser throws on missing tokens', () => {
    expect(() => parseFhirPath('1 * ')).toThrow('Cant consume unknown more tokens.');
  });

  test('Function minus number', () => {
    expect(evalFhirPath("'Peter'.length()-3", [])).toEqual([2]);
  });

  test('Evaluate FHIRPath Patient.name.given on empty resource', () => {
    const result = evalFhirPath('Patient.name.given', [toTypedValue({})]);
    expect(result).toEqual([]);
  });

  test('Evaluate FHIRPath Patient.name.given', () => {
    const result = evalFhirPath('Patient.name.given', [
      toTypedValue({
        resourceType: 'Patient',
        name: [
          {
            given: ['Alice'],
            family: 'Smith',
          },
        ],
      }),
    ]);
    expect(result).toEqual(['Alice']);
  });

  test('Evaluate FHIRPath string concatenation', () => {
    const result = evalFhirPath("Patient.name.given + ' ' + Patient.name.family", [
      toTypedValue({
        resourceType: 'Patient',
        name: [
          {
            given: ['Alice'],
            family: 'Smith',
          },
        ],
      }),
    ]);
    expect(result).toEqual(['Alice Smith']);
  });

  test('Evaluate FHIRPath Patient.name.given on array of resources', () => {
    const result = evalFhirPath('Patient.name.given', [
      toTypedValue({
        resourceType: 'Patient',
        name: [
          {
            given: ['Alice'],
            family: 'Smith',
          },
        ],
      }),
      toTypedValue({
        resourceType: 'Patient',
        name: [
          {
            given: ['Bob'],
            family: 'Jones',
          },
        ],
      }),
    ]);
    expect(result).toEqual(['Alice', 'Bob']);
  });

  test('Evaluate FHIRPath Patient.name[1].given', () => {
    const result = evalFhirPath('Patient.name[1].given', [
      toTypedValue({
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
      }),
    ]);
    expect(result).toEqual(['Robert']);
  });

  test('Evaluate FHIRPath Patient.name[ (10 - 8) / 2].given', () => {
    const result = evalFhirPath('Patient.name[ (10 - 8) / 2].given', [
      toTypedValue({
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
      }),
    ]);
    expect(result).toEqual(['Robert']);
  });

  test('Evaluate FHIRPath Patient.name.select(given[0])', () => {
    const result = evalFhirPath('Patient.name.select(given[0])', [
      toTypedValue({
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
      }),
    ]);
    expect(result).toEqual(['Bob', 'Robert']);
  });

  test('Evaluate FHIRPath Patient.name.select(given[1])', () => {
    const result = evalFhirPath('Patient.name.select(given[1])', [
      toTypedValue({
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
      }),
    ]);
    expect(result).toEqual(['Adam']);
  });

  test('Evaluate FHIRPath string concatenation on array of resources', () => {
    const result = evalFhirPath("Patient.name.given + ' ' + Patient.name.family", [
      toTypedValue({
        resourceType: 'Patient',
        name: [
          {
            given: ['Alice'],
            family: 'Smith',
          },
        ],
      }),
      toTypedValue({
        resourceType: 'Patient',
        name: [
          {
            given: ['Bob'],
            family: 'Jones',
          },
        ],
      }),
    ]);
    expect(result).toEqual(['Alice Smith', 'Bob Jones']);
  });

  test('Evaluate FHIRPath Patient.name.given on array of resources', () => {
    const result = evalFhirPath('Patient.name.given', [
      toTypedValue({
        resourceType: 'Practitioner',
        name: [
          {
            given: ['Alice'],
            family: 'Smith',
          },
        ],
      }),
      toTypedValue({
        resourceType: 'Patient',
        name: [
          {
            given: ['Bob'],
            family: 'Jones',
          },
        ],
      }),
    ]);
    expect(result).toEqual(['Bob']);
  });

  test('Evaluate FHIRPath union', () => {
    const result = evalFhirPath('Practitioner.name.given | Patient.name.given', [
      toTypedValue({
        resourceType: 'Patient',
        name: [
          {
            given: ['Alice'],
            family: 'Smith',
          },
        ],
      }),
    ]);
    expect(result).toEqual(['Alice']);
  });

  test('Evaluate FHIRPath union to combine results', () => {
    const result = evalFhirPath('Practitioner.name.given | Patient.name.given', [
      toTypedValue({
        resourceType: 'Patient',
        name: [
          {
            given: ['Alice'],
            family: 'Smith',
          },
        ],
      }),
      toTypedValue({
        resourceType: 'Practitioner',
        name: [
          {
            given: ['Bob'],
            family: 'Jones',
          },
        ],
      }),
    ]);
    expect(result).toEqual(['Alice', 'Bob']);
  });

  test('Evaluate FHIRPath double union', () => {
    const result = evalFhirPath('Patient.name.given | Patient.name.given', [
      toTypedValue({
        resourceType: 'Patient',
        name: [
          {
            given: ['Alice'],
            family: 'Smith',
          },
        ],
      }),
      toTypedValue({
        resourceType: 'Patient',
        name: [
          {
            given: ['Bob'],
            family: 'Jones',
          },
        ],
      }),
    ]);
    expect(result).toEqual(['Alice', 'Bob']);
  });

  test('Evaluate ignores non-objects', () => {
    const result = evalFhirPath('foo.bar', [
      toTypedValue({
        foo: 1,
      }),
    ]);
    expect(result).toEqual([]);
  });

  test('Evaluate fails on function parentheses after non-symbol', () => {
    expect(() => evalFhirPath('1()', [])).toThrow('Unexpected parentheses');
  });

  test('Evaluate fails on unrecognized function', () => {
    expect(() => evalFhirPath('asdf()', [])).toThrow('Unrecognized function');
  });

  test('Evaluate FHIRPath where function', () => {
    const result = evalFhirPath("Patient.telecom.where(system='email')", [
      toTypedValue({
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
      }),
    ]);
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
    const observation = {
      resourceType: 'Observation',
      subject: {
        reference: 'Patient/123',
      },
    };

    const result = evalFhirPath('Observation.subject.resolve()', [toTypedValue(observation)]);

    expect(result).toMatchObject([
      {
        resourceType: 'Patient',
        id: '123',
      },
    ]);
  });

  test('Resolve is resourceType', () => {
    const auditEvent = {
      resourceType: 'AuditEvent',
      entity: [
        {
          what: {
            reference: 'Patient/123',
          },
        },
      ],
    };

    const result = evalFhirPath('AuditEvent.entity.what.where(resolve() is Patient)', [toTypedValue(auditEvent)]);
    expect(result).toEqual([{ reference: 'Patient/123' }]);
  });

  test('Resolve is not resourceType', () => {
    const auditEvent = {
      resourceType: 'AuditEvent',
      entity: [
        {
          what: {
            reference: 'Subscription/123',
          },
        },
      ],
    };

    const result = evalFhirPath('AuditEvent.entity.what.where(resolve() is Patient)', [toTypedValue(auditEvent)]);
    expect(result).toEqual([]);
  });

  test('Calculate patient age', () => {
    const birthDate = new Date();
    birthDate.setFullYear(birthDate.getFullYear() - 20);

    const patient: Patient = {
      resourceType: 'Patient',
      birthDate: birthDate.toLocaleDateString('sv'),
    };
    const result = evalFhirPath("between(birthDate, now(), 'years')", [toTypedValue(patient)]);
    expect(result).toEqual([{ value: 20, unit: 'years' }]);
  });

  test('Boolean values', () => {
    const patient1: Patient = { resourceType: 'Patient', active: true };
    const result1 = evalFhirPathTyped('active', [toTypedValue(patient1)]);
    expect(result1).toEqual([{ type: PropertyType.boolean, value: true }]);

    const patient2: Patient = { resourceType: 'Patient', active: false };
    const result2 = evalFhirPathTyped('active', [toTypedValue(patient2)]);
    expect(result2).toEqual([{ type: PropertyType.boolean, value: false }]);
  });

  test('Schema type lookup', () => {
    const patient: Patient = {
      resourceType: 'Patient',
      telecom: [
        { system: 'phone', value: '555-555-5555' },
        { system: 'email', value: 'alice@example.com' },
      ],
    };
    const result = evalFhirPathTyped('telecom', [toTypedValue(patient)]);
    expect(result).toEqual([
      {
        type: PropertyType.ContactPoint,
        value: { system: 'phone', value: '555-555-5555' },
      },
      {
        type: PropertyType.ContactPoint,
        value: { system: 'email', value: 'alice@example.com' },
      },
    ]);
  });

  test('Context type comparison', () => {
    const patient: Patient = {
      resourceType: 'Patient',
      telecom: [
        { system: 'phone', value: '555-555-5555' },
        { system: 'email', value: 'alice@example.com' },
      ],
    };

    const patient2: Patient = {
      resourceType: 'Patient',
      telecom: [
        { system: 'phone', value: '555-555-5555' },
        { system: 'email', value: 'alice@example.com' },
      ],
    };
    const variables = { '%current': toTypedValue(patient2), '%previous': toTypedValue(patient) };
    const result = evalFhirPathTyped('%current=%previous', [toTypedValue(patient)], variables);

    expect(result).toEqual([
      {
        type: PropertyType.boolean,
        value: true,
      },
    ]);
  });

  test('%previous.empty() returns true for an empty %previous value', () => {
    const patient: Patient = {
      resourceType: 'Patient',
    };
    const result = evalFhirPathTyped('%previous.empty()', [toTypedValue(patient)], { '%previous': toTypedValue({}) });

    expect(result).toEqual([
      {
        type: PropertyType.boolean,
        value: true,
      },
    ]);
  });

  test('%previous.exists().not() returns true for an empty %previous value', () => {
    const patient: Patient = {
      resourceType: 'Patient',
    };
    const result = evalFhirPathTyped('%previous.exists().not()', [toTypedValue(patient)], {
      '%previous': toTypedValue({}),
    });

    expect(result).toEqual([
      {
        type: PropertyType.boolean,
        value: true,
      },
    ]);
  });

  test('Context type comparison false', () => {
    const patient: Patient = {
      resourceType: 'Patient',
      telecom: [
        { system: 'phone', value: '555-555-5555' },
        { system: 'email', value: 'alice@example.com' },
      ],
    };

    const patient2: Patient = {
      resourceType: 'Patient',
      telecom: [
        { system: 'phone', value: '555-555-5555' },
        { system: 'email', value: 'alice@example.com' },
      ],
    };
    const variables = { '%current': toTypedValue(patient2), '%previous': toTypedValue(patient) };
    const result = evalFhirPathTyped('%current!=%previous', [toTypedValue(patient)], variables);

    expect(result).toEqual([
      {
        type: PropertyType.boolean,
        value: false,
      },
    ]);
  });

  test('Variable missing in context', () => {
    const patient: Patient = {
      resourceType: 'Patient',
      telecom: [
        { system: 'phone', value: '555-555-5555' },
        { system: 'email', value: 'alice@example.com' },
      ],
    };

    const patient2: Patient = {
      resourceType: 'Patient',
      telecom: [
        { system: 'phone', value: '555-555-5555' },
        { system: 'email', value: 'alice@example.com' },
      ],
    };
    const variables = { '%current': toTypedValue(patient2) };

    expect(() => evalFhirPathTyped('%current=%previous', [toTypedValue(patient)], variables)).toThrow(
      `Undefined variable %previous`
    );
  });

  test('Choice of type', () => {
    const observations = [
      {
        resourceType: 'Observation',
        valueQuantity: { value: 100, unit: 'mg' },
      },
      {
        resourceType: 'Observation',
        valueString: 'foo',
      },
    ];
    const result = evalFhirPathTyped(
      'value',
      observations.map((o) => toTypedValue(o))
    );
    expect(result).toEqual([
      {
        type: PropertyType.Quantity,
        value: { value: 100, unit: 'mg' },
      },
      {
        type: PropertyType.string,
        value: 'foo',
      },
    ]);
  });

  test('GraphQL embedded queries', () => {
    const observations: Observation[] = [
      {
        resourceType: 'Observation',
        code: { coding: [{ code: 'ALB' }] },
        valueQuantity: { value: 120, unit: 'ng/dL' },
      } as Observation,
      {
        resourceType: 'Observation',
        code: { coding: [{ code: 'HBA1C' }] },
        valueQuantity: { value: 5, unit: '%' },
      } as Observation,
    ];

    // This is an example of how FHIR GraphQL returns embedded searches.
    // The "ObservationList" is not a real property, but a search result.
    const serviceRequest = {
      resourceType: 'ServiceRequest',
      ObservationList: observations,
    };

    const query = "ObservationList.where(code.coding[0].code='HBA1C').value";
    const result = evalFhirPathTyped(query, [toTypedValue(serviceRequest)]);
    expect(result).toEqual([
      {
        type: PropertyType.Quantity,
        value: { value: 5, unit: '%' },
      },
    ]);
  });

  test('ValueSet vsd-2', () => {
    const expr = '(concept.exists() or filter.exists()) implies system.exists()';
    const system = 'http://example.com';
    const concept = [{ code: 'foo' }];
    const filter = [{ property: 'bar', op: 'eq', value: 'baz' }];
    expect(evalFhirPath(expr, {})).toEqual([true]);
    expect(evalFhirPath(expr, { concept })).toEqual([false]);
    expect(evalFhirPath(expr, { concept, filter })).toEqual([false]);
    expect(evalFhirPath(expr, { filter })).toEqual([false]);
    expect(evalFhirPath(expr, { concept, system })).toEqual([true]);
    expect(evalFhirPath(expr, { concept, filter, system })).toEqual([true]);
  });

  test('where and', () => {
    const expr = "identifier.where(system='http://example.com' and value='123').exists()";

    const e1: Encounter = {
      resourceType: 'Encounter',
      status: 'finished',
      class: { code: 'foo' },
      identifier: [{ system: 'http://example.com', value: '123' }],
    };
    expect(evalFhirPath(expr, e1)).toEqual([true]);

    const e2: Encounter = {
      resourceType: 'Encounter',
      status: 'finished',
      class: { code: 'foo' },
      identifier: [{ system: 'http://example.com', value: '456' }],
    };
    expect(evalFhirPath(expr, e2)).toEqual([false]);
  });

  test('Bundle bdl-3', () => {
    // entry.request mandatory for batch/transaction/history, otherwise prohibited
    const expr =
      "entry.all(request.exists() = (%resource.type = 'batch' or %resource.type = 'transaction' or %resource.type = 'history'))";

    const b1: Bundle = {
      resourceType: 'Bundle',
      type: 'batch',
      entry: [
        {
          request: {
            method: 'POST',
            url: 'Patient',
          },
          resource: {
            resourceType: 'Patient',
            id: '123',
          },
        },
      ],
    };
    const tb1 = toTypedValue(b1);
    expect(evalFhirPathTyped(expr, [tb1], { '%resource': tb1 })).toEqual([toTypedValue(true)]);

    const b2: Bundle = {
      resourceType: 'Bundle',
      type: 'collection',
      entry: [
        {
          resource: {
            resourceType: 'Patient',
            id: '123',
          },
        },
      ],
    };
    const tb2 = toTypedValue(b2);
    expect(evalFhirPathTyped(expr, [tb2], { '%resource': tb2 })).toEqual([toTypedValue(true)]);
  });

  test('At symbols', () => {
    // Example of "incorrect" fhirpath expression from sql-on-fhir test suite
    const expr = '@@';
    expect(() => parseFhirPath(expr)).toThrow('Invalid DateTime literal');
  });
});
