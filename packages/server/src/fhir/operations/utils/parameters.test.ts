import { indexStructureDefinitionBundle } from '@medplum/core';
import { readJson } from '@medplum/definitions';
import {
  Observation,
  OperationDefinition,
  Parameters,
  ParametersParameter,
  Patient,
  Reference,
} from '@medplum/fhirtypes';
import { Request } from 'express';
import { parse } from 'qs';
import { buildOutputParameters, parseInputParameters, parseParameters } from './parameters';

describe('FHIR Parameters parsing', () => {
  test('Read Parameters', () => {
    const input: Parameters = {
      resourceType: 'Parameters',
      parameter: [
        { name: 'x', valueString: 'y' },
        { name: 'a', valueString: 'b' },
      ],
    };

    const result = parseParameters(input);
    expect(result).toMatchObject({ x: 'y', a: 'b' });
  });

  test('Empty Parameters', () => {
    const input: Parameters = { resourceType: 'Parameters' };
    const result = parseParameters(input);
    expect(result).toMatchObject({});
  });

  test('Read JSON', () => {
    const input = { x: 'y', a: 'b' };
    const result = parseParameters(input);
    expect(result).toMatchObject(input);
  });
});

const opDef: OperationDefinition = {
  resourceType: 'OperationDefinition',
  name: 'test',
  status: 'active',
  kind: 'operation',
  code: 'test',
  system: true,
  type: false,
  instance: false,
  parameter: [
    { name: 'singleIn', use: 'in', min: 0, max: '1', type: 'string' },
    { name: 'requiredIn', use: 'in', min: 1, max: '1', type: 'boolean' },
    { name: 'numeric', use: 'in', min: 0, max: '1', type: 'integer' },
    { name: 'fractional', use: 'in', min: 0, max: '1', type: 'decimal' },
    { name: 'multiIn', use: 'in', min: 0, max: '*', type: 'Reference' },
    {
      name: 'partsIn',
      use: 'in',
      min: 0,
      max: '*',
      part: [
        { use: 'in', name: 'foo', min: 1, max: '1', type: 'string' },
        { use: 'in', name: 'bar', min: 0, max: '1', type: 'boolean' },
      ],
    },
    { name: 'singleOut', use: 'out', min: 1, max: '1', type: 'Quantity' },
    { name: 'multiOut', use: 'out', min: 0, max: '*', type: 'Reference' },
  ],
};

describe('Operation Input Parameters parsing', () => {
  beforeAll(() => {
    indexStructureDefinitionBundle(readJson('fhir/r4/profiles-resources.json'));
  });

  test.each<[ParametersParameter[], Record<string, any>]>([
    [[{ name: 'requiredIn', valueBoolean: true }], { requiredIn: true, singleIn: undefined, multiIn: [], partsIn: [] }],
    [
      [
        { name: 'requiredIn', valueBoolean: false },
        { name: 'singleIn', valueString: 'Hi!' },
      ],
      { requiredIn: false, singleIn: 'Hi!', multiIn: [], partsIn: [] },
    ],
    [
      [
        { name: 'requiredIn', valueBoolean: true },
        { name: 'multiIn', valueReference: { reference: 'Patient/test' } },
      ],
      { requiredIn: true, multiIn: [{ reference: 'Patient/test' }], singleIn: undefined, partsIn: [] },
    ],
    [
      [
        { name: 'requiredIn', valueBoolean: true },
        { name: 'multiIn', valueReference: { reference: 'Patient/test' } },
        { name: 'multiIn', valueReference: { reference: 'Patient/example' } },
      ],
      {
        requiredIn: true,
        multiIn: [{ reference: 'Patient/test' }, { reference: 'Patient/example' }],
        singleIn: undefined,
        partsIn: [],
      },
    ],
    [
      [
        { name: 'requiredIn', valueBoolean: true },
        { name: 'multiIn', valueReference: { reference: 'Patient/test' } },
        { name: 'singleIn', valueString: 'Hello!' },
        { name: 'multiIn', valueReference: { reference: 'Patient/example' } },
      ],
      {
        requiredIn: true,
        singleIn: 'Hello!',
        multiIn: [{ reference: 'Patient/test' }, { reference: 'Patient/example' }],
        partsIn: [],
      },
    ],
    [
      [
        { name: 'requiredIn', valueBoolean: true },
        {
          name: 'partsIn',
          part: [
            { name: 'foo', valueString: 'baz' },
            { name: 'bar', valueBoolean: false },
          ],
        },
      ],
      {
        requiredIn: true,
        partsIn: [{ foo: 'baz', bar: false }],
        singleIn: undefined,
        multiIn: [],
      },
    ],
    [
      [
        { name: 'requiredIn', valueBoolean: true },
        {
          name: 'partsIn',
          part: [{ name: 'foo', valueString: 'baz' }],
        },
      ],
      {
        requiredIn: true,
        partsIn: [{ foo: 'baz' }],
        singleIn: undefined,
        multiIn: [],
      },
    ],
  ])('Read input Parameters', (params, expected) => {
    const req: Request = {
      body: {
        resourceType: 'Parameters',
        parameter: params,
      },
    } as unknown as Request;
    expect(parseInputParameters(opDef, req)).toEqual(expected);
  });

  test('Read raw JSON as fallback', () => {
    const req: Request = {
      body: {
        requiredIn: false,
        singleIn: 'Yo',
        multiIn: [{ reference: 'Observation/bp' }, { reference: 'Observation/bmi' }],
        extraneous: 4,
      },
    } as unknown as Request;
    expect(parseInputParameters(opDef, req)).toEqual({
      requiredIn: false,
      singleIn: 'Yo',
      multiIn: [{ reference: 'Observation/bp' }, { reference: 'Observation/bmi' }],
    });
  });

  test.each<[Parameters | Record<string, any>, string]>([
    [{}, `Expected at least 1 value(s) for required input parameter 'requiredIn'`],
    [
      { resourceType: 'Parameters', parameter: [] },
      'Expected 1 value(s) for input parameter requiredIn, but 0 provided',
    ],
    [
      {
        resourceType: 'Parameters',
        parameter: [
          { name: 'requiredIn', valueBoolean: true },
          { name: 'requiredIn', valueBoolean: false },
        ],
      },
      'Expected 1 value(s) for input parameter requiredIn, but 2 provided',
    ],
    [{ requiredIn: [true, false] }, 'Expected 1 value(s) for input parameter requiredIn, but 2 provided'],
    [
      {
        resourceType: 'Parameters',
        parameter: [
          { name: 'requiredIn', valueBoolean: false },
          { name: 'singleIn', valueString: 'a' },
          { name: 'singleIn', valueString: 'b' },
        ],
      },
      'Expected 0..1 value(s) for input parameter singleIn, but 2 provided',
    ],
    [
      { requiredIn: false, singleIn: ['a', 'b'] },
      'Expected 0..1 value(s) for input parameter singleIn, but 2 provided',
    ],
  ])('Throws error on incorrect argument counts: %j', (body, errorMsg) => {
    const req: Request = { body } as unknown as Request;
    expect(() => parseInputParameters(opDef, req)).toThrow(new Error(errorMsg));
  });

  test.each<[Parameters, string]>([
    [
      {
        resourceType: 'Parameters',
        parameter: [{ name: 'requiredIn', valueBoolean: 'Hi!' }],
      } as unknown as Parameters,
      'Invalid JSON type: expected boolean, but got string (Parameters.parameter.value[x])',
    ],
    [
      { resourceType: 'Parameters', parameter: [{ valueQuantity: { value: 5 } }] } as unknown as Parameters,
      'Missing required property (Parameters.parameter[0].name)',
    ],
  ])('Throws error on invalid Parameters: %j', (parameters, errorMsg) => {
    const req: Request = { body: parameters } as unknown as Request;
    expect(() => parseInputParameters(opDef, req)).toThrow(new Error(errorMsg));
  });

  test('Parses query string parameters as correct type', () => {
    const req: Request = {
      method: 'GET',
      query: parse('requiredIn=true&numeric=100&fractional=3.14159'),
    } as unknown as Request;
    expect(parseInputParameters(opDef, req)).toEqual({ requiredIn: true, numeric: 100, fractional: 3.14159 });
  });

  test.each<[string, string]>([
    [
      'requiredIn=true&multiIn={"reference":"Patient/foo"}',
      'Complex parameter multiIn (Reference) cannot be passed via query string',
    ],
    ['requiredIn=false&numeric=wrong', `Invalid value 'wrong' provided for integer parameter`],
    ['requiredIn=false&fractional=wrong', `Invalid value 'wrong' provided for decimal parameter`],
    ['requiredIn=1', `Invalid value '1' provided for boolean parameter`],
  ])('Throws on invalid query string parameters: %s', (query, errorMsg) => {
    const req: Request = { method: 'GET', query: parse(query) } as unknown as Request;
    expect(() => parseInputParameters(opDef, req)).toThrow(new Error(errorMsg));
  });
});

describe('Send Operation output Parameters', () => {
  beforeEach(() => {
    jest.resetAllMocks();
  });

  test('Single required parameter', async () => {
    const parameters = buildOutputParameters(opDef, { singleOut: { value: 20.2, unit: 'kg/m^2' } });
    expect(parameters).toMatchObject({
      resourceType: 'Parameters',
      parameter: [{ name: 'singleOut', valueQuantity: { value: 20.2, unit: 'kg/m^2' } }],
    });
  });

  test('Optional output parameter', async () => {
    const parameters = buildOutputParameters(opDef, {
      singleOut: { value: 20.2, unit: 'kg/m^2' },
      multiOut: [{ reference: 'Observation/height' }, { reference: 'Observation/weight' }],
    });
    expect(parameters).toMatchObject({
      resourceType: 'Parameters',
      parameter: [
        { name: 'singleOut', valueQuantity: { value: 20.2, unit: 'kg/m^2' } },
        { name: 'multiOut', valueReference: { reference: 'Observation/height' } },
        { name: 'multiOut', valueReference: { reference: 'Observation/weight' } },
      ],
    });
  });

  test('Return resource output', () => {
    const resourceReturnOp: OperationDefinition = {
      ...opDef,
      parameter: [{ name: 'return', use: 'out', type: 'Observation', min: 1, max: '1' }],
    };
    const obs = {
      resourceType: 'Observation',
      status: 'final',
      code: {
        coding: [{ system: 'http://loinc.org', code: '39156-5', display: 'Body mass index (BMI) [Ratio]' }],
      },
      valueQuantity: {
        value: 19.6,
        unit: 'kg/m^2',
      },
    } as Observation;
    const output = buildOutputParameters(resourceReturnOp, obs);
    expect(output).toMatchObject(obs);
  });

  test('Returns error on non-resource', () => {
    const resourceReturnOp: OperationDefinition = {
      ...opDef,
      parameter: [{ name: 'return', use: 'out', type: 'Observation', min: 1, max: '1' }],
    };
    const ref = { reference: 'Observation/bmi' } as Reference;

    try {
      buildOutputParameters(resourceReturnOp, ref);
      throw new Error('expected error');
    } catch (err: any) {
      expect(err.message).toBe('Expected Observation output, but got unexpected object');
    }
  });

  test('Returns error on incorrect resource type', () => {
    const resourceReturnOp: OperationDefinition = {
      ...opDef,
      parameter: [{ name: 'return', use: 'out', type: 'Observation', min: 1, max: '1' }],
    };
    const patient = { resourceType: 'Patient' } as Patient;

    try {
      buildOutputParameters(resourceReturnOp, patient);
      throw new Error('expected error');
    } catch (err: any) {
      expect(err.message).toBe('Expected Observation output, but got unexpected object');
    }
  });

  test('Missing required parameter', () => {
    try {
      buildOutputParameters(opDef, { incorrectOut: { value: 20.2, unit: 'kg/m^2' } });
      throw new Error('expected error');
    } catch (err: any) {
      expect(err.message).toBe("Expected 1 or more values for output parameter 'singleOut', got 0");
    }
  });

  test('Omits extraneous parameters', async () => {
    const parameters = buildOutputParameters(opDef, { singleOut: { value: 20.2, unit: 'kg/m^2' }, extraOut: 'foo' });
    expect(parameters).toMatchObject({
      resourceType: 'Parameters',
      parameter: [{ name: 'singleOut', valueQuantity: { value: 20.2, unit: 'kg/m^2' } }],
    });
  });

  test('Returns error on invalid output', () => {
    try {
      buildOutputParameters(opDef, { singleOut: { reference: 'Observation/foo' } });
      throw new Error('expected error');
    } catch (err: any) {
      expect(err.message).toBe('Invalid additional property "reference" (Parameters.parameter.value[x].reference)');
    }
  });
});
