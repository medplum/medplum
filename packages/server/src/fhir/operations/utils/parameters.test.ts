import {
  Observation,
  OperationDefinition,
  OperationOutcome,
  Parameters,
  ParametersParameter,
  Patient,
  Reference,
} from '@medplum/fhirtypes';
import { parseInputParameters, parseParameters, sendOutputParameters } from './parameters';
import { Request, Response } from 'express';
import { allOk, created, indexStructureDefinitionBundle } from '@medplum/core';
import { withTestContext } from '../../../test.setup';
import { readJson } from '@medplum/definitions';

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
    { name: 'multiIn', use: 'in', min: 0, max: '*', type: 'Reference' },
    { name: 'singleOut', use: 'out', min: 1, max: '1', type: 'Quantity' },
    { name: 'multiOut', use: 'out', min: 0, max: '*', type: 'Reference' },
  ],
};

describe('Operation Input Parameters parsing', () => {
  beforeAll(() => {
    indexStructureDefinitionBundle(readJson('fhir/r4/profiles-resources.json'));
  });

  test.each<[ParametersParameter[], Record<string, any>]>([
    [[{ name: 'requiredIn', valueBoolean: true }], { requiredIn: true, singleIn: undefined, multiIn: [] }],
    [
      [
        { name: 'requiredIn', valueBoolean: false },
        { name: 'singleIn', valueString: 'Hi!' },
      ],
      { requiredIn: false, singleIn: 'Hi!', multiIn: [] },
    ],
    [
      [
        { name: 'requiredIn', valueBoolean: true },
        { name: 'multiIn', valueReference: { reference: 'Patient/test' } },
      ],
      { requiredIn: true, multiIn: [{ reference: 'Patient/test' }], singleIn: undefined },
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
    [{}, `Expected required input parameter 'requiredIn'`],
    [{ resourceType: 'Parameters', parameter: [] }, 'Expected 1 value for input parameter requiredIn, but 0 provided'],
    [
      {
        resourceType: 'Parameters',
        parameter: [
          { name: 'requiredIn', valueBoolean: true },
          { name: 'requiredIn', valueBoolean: false },
        ],
      },
      'Expected 1 value for input parameter requiredIn, but 2 provided',
    ],
    [{ requiredIn: [true, false] }, 'Expected 1 value for input parameter requiredIn, but 2 provided'],
    [
      {
        resourceType: 'Parameters',
        parameter: [
          { name: 'requiredIn', valueBoolean: false },
          { name: 'singleIn', valueString: 'a' },
          { name: 'singleIn', valueString: 'b' },
        ],
      },
      'Expected 0..1 value for input parameter singleIn, but 2 provided',
    ],
    [{ requiredIn: false, singleIn: ['a', 'b'] }, 'Expected 0..1 value for input parameter singleIn, but 2 provided'],
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
      'Missing required property (Parameters.parameter.name)',
    ],
  ])('Throws error on invalid Parameters: %j', (parameters, errorMsg) => {
    const req: Request = { body: parameters } as unknown as Request;
    expect(() => parseInputParameters(opDef, req)).toThrow(new Error(errorMsg));
  });
});

describe('Send Operation output Parameters', () => {
  const res = {
    set: jest.fn(),
    status: jest.fn(),
    json: jest.fn(),
  } as unknown as Response;

  beforeEach(() => {
    jest.resetAllMocks();
    (res.status as jest.Mock).mockReturnThis();
  });

  test('Single required parameter', async () => {
    await sendOutputParameters(opDef, res, allOk, { singleOut: { value: 20.2, unit: 'kg/m^2' } });

    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith<[Parameters]>({
      resourceType: 'Parameters',
      parameter: [{ name: 'singleOut', valueQuantity: { value: 20.2, unit: 'kg/m^2' } }],
    });
  });

  test('Optional output parameter', async () => {
    await sendOutputParameters(opDef, res, created, {
      singleOut: { value: 20.2, unit: 'kg/m^2' },
      multiOut: [{ reference: 'Observation/height' }, { reference: 'Observation/weight' }],
    });

    expect(res.status).toHaveBeenCalledWith(201);
    expect(res.json).toHaveBeenCalledWith<[Parameters]>({
      resourceType: 'Parameters',
      parameter: [
        { name: 'singleOut', valueQuantity: { value: 20.2, unit: 'kg/m^2' } },
        { name: 'multiOut', valueReference: { reference: 'Observation/height' } },
        { name: 'multiOut', valueReference: { reference: 'Observation/weight' } },
      ],
    });
  });

  test('Return resource output', () =>
    withTestContext(async () => {
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
      await sendOutputParameters(resourceReturnOp, res, allOk, obs);

      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith(obs);
    }));

  test('Returns error on non-resource', () =>
    withTestContext(async () => {
      const resourceReturnOp: OperationDefinition = {
        ...opDef,
        parameter: [{ name: 'return', use: 'out', type: 'Observation', min: 1, max: '1' }],
      };
      const ref = { reference: 'Observation/bmi' } as Reference;
      await sendOutputParameters(resourceReturnOp, res, allOk, ref);

      expect(res.status).toHaveBeenCalledWith(500);
      expect(res.json).toHaveBeenCalledWith<[OperationOutcome]>(
        expect.objectContaining({
          resourceType: 'OperationOutcome',
          issue: [
            {
              severity: 'error',
              code: 'exception',
              details: { text: 'Internal server error' },
              diagnostics: 'Error: Expected Observation output, but got unexpected object',
            },
          ],
        })
      );
    }));

  test('Returns error on incorrect resource type', () =>
    withTestContext(async () => {
      const resourceReturnOp: OperationDefinition = {
        ...opDef,
        parameter: [{ name: 'return', use: 'out', type: 'Observation', min: 1, max: '1' }],
      };
      const patient = { resourceType: 'Patient' } as Patient;
      await sendOutputParameters(resourceReturnOp, res, allOk, patient);

      expect(res.status).toHaveBeenCalledWith(500);
      expect(res.json).toHaveBeenCalledWith<[OperationOutcome]>(
        expect.objectContaining({
          resourceType: 'OperationOutcome',
          issue: [
            {
              severity: 'error',
              code: 'exception',
              details: { text: 'Internal server error' },
              diagnostics: 'Error: Expected Observation output, but got unexpected object',
            },
          ],
        })
      );
    }));

  test('Missing required parameter', () =>
    withTestContext(async () => {
      await sendOutputParameters(opDef, res, allOk, { incorrectOut: { value: 20.2, unit: 'kg/m^2' } });

      expect(res.status).toHaveBeenCalledWith(500);
      expect(res.json).toHaveBeenCalledWith<[OperationOutcome]>(
        expect.objectContaining({
          resourceType: 'OperationOutcome',
          issue: [
            {
              severity: 'error',
              code: 'exception',
              details: { text: 'Internal server error' },
              diagnostics: "Error: Expected 1 or more values for output parameter 'singleOut', got 0",
            },
          ],
        })
      );
    }));

  test('Omits extraneous parameters', async () => {
    await sendOutputParameters(opDef, res, allOk, { singleOut: { value: 20.2, unit: 'kg/m^2' }, extraOut: 'foo' });

    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith<[Parameters]>({
      resourceType: 'Parameters',
      parameter: [{ name: 'singleOut', valueQuantity: { value: 20.2, unit: 'kg/m^2' } }],
    });
  });

  test('Returns error on invalid output', () =>
    withTestContext(async () => {
      await sendOutputParameters(opDef, res, allOk, { singleOut: { reference: 'Observation/foo' } });

      expect(res.status).toHaveBeenCalledWith(500);
      expect(res.json).toHaveBeenCalledWith<[OperationOutcome]>(
        expect.objectContaining({
          resourceType: 'OperationOutcome',
          issue: [
            {
              severity: 'error',
              code: 'exception',
              details: { text: 'Internal server error' },
              diagnostics: 'Error: Invalid additional property "reference" (Parameters.parameter.value[x].reference)',
            },
          ],
        })
      );
    }));
});
