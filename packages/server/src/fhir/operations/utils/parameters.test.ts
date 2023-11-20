import { OperationDefinition, Parameters, ParametersParameter } from '@medplum/fhirtypes';
import { parseInputParameters, parseParameters } from './parameters';
import { loadTestConfig } from '../../../config';
import { initApp, shutdownApp } from '../../../app';
import express, { Request } from 'express';

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
  ],
};

const app = express();
describe('Operation Input Parameters parsing', () => {
  beforeAll(async () => {
    const config = await loadTestConfig();
    await initApp(app, config);
  });

  afterAll(async () => {
    await shutdownApp();
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
  ])('Read Parameters', (params, expected) => {
    const req: Request = {
      body: {
        resourceType: 'Parameters',
        parameter: params,
      },
    } as unknown as Request;
    expect(parseInputParameters(opDef, req)).toEqual(expected);
  });
});
