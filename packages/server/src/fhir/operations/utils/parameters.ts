import { OperationOutcomeError, badRequest, capitalize, isResource, serverError } from '@medplum/core';
import {
  OperationDefinition,
  OperationDefinitionParameter,
  OperationOutcome,
  Parameters,
  ParametersParameter,
} from '@medplum/fhirtypes';
import { Request, Response } from 'express';
import { sendResponse } from '../../routes';

export function parseParameters<T>(input: T | Parameters): T {
  if (input && typeof input === 'object' && 'resourceType' in input && input.resourceType === 'Parameters') {
    // Convert the parameters to input
    const parameters = (input as Parameters).parameter ?? [];
    return Object.fromEntries(parameters.map((p) => [p.name, p.valueString]));
  } else {
    return input as T;
  }
}

export function parseInputParameters<T>(operation: OperationDefinition, req: Request): T {
  const parsed = Object.create(null);
  if (!operation.parameter) {
    return parsed;
  }

  const input = req.body;

  const inputParameters = input.resourceType === 'Parameters' ? (input as Parameters) : undefined;
  for (const param of operation.parameter.filter((p) => p.use === 'in')) {
    const paramName = param.name as string;
    const min = param.min ?? 0;
    const max = parseInt(param.max ?? '1', 10);
    let value: any;
    if (inputParameters) {
      // FHIR spec-compliant case: Parameters resource e.g.
      // { resourceType: 'Parameters', parameter: [{ name: 'message', valueString: 'Hello!' }] }
      const inParam = inputParameters.parameter?.filter((p) => p.name === param.name);
      const n = inParam?.length ?? 0;
      if (inParam) {
        if (max === 1) {
          if (n > 1) {
            throw new OperationOutcomeError(badRequest(`Multiple values provided for parameter ${paramName}`));
          }
          value = inParam[0]?.[('value' + capitalize(param.type ?? 'string')) as keyof ParametersParameter];
        } else {
          value = inParam.map((v) => v[('value' + capitalize(param.type ?? 'string')) as keyof ParametersParameter]);
        }
      }
    } else {
      // Fallback case: Plain JSON Object e.g.
      // { message: 'Hello!' }
      value = input[paramName];
    }

    if (Array.isArray(value)) {
      if (value.length < min || value.length > max) {
        throw new OperationOutcomeError(
          badRequest(`Expected ${min}..${max} values for parameter ${paramName}, but ${value.length} provided`)
        );
      }
    } else if (min > 1) {
      throw new OperationOutcomeError(badRequest(`Expected at least ${min} values for parameter ${paramName}`));
    }

    parsed[paramName] = value;
  }

  return parsed;
}

export async function sendOutputParameters(
  operation: OperationDefinition,
  res: Response,
  outcome: OperationOutcome,
  output: any
): Promise<void> {
  const outputParameters = operation.parameter?.filter((p) => p.use === 'out');
  const param1 = outputParameters?.[0];
  if (outputParameters?.length === 1 && param1 && param1.name === 'return') {
    if (!isResource(output)) {
      throw new OperationOutcomeError(
        serverError(new Error(`Expected ${param1.type ?? 'Resource'} output, but got unexpected ${typeof output}`))
      );
    }

    // Send Resource as output directly, instead of using Parameters format
    await sendResponse(res, outcome, output);
    return;
  }
  const response: Parameters = {
    resourceType: 'Parameters',
    parameter: [],
  };
  if (!outputParameters?.length) {
    // Send empty Parameters as response
    res.json(response);
    return;
  }

  for (const param of outputParameters) {
    const key = param.name ?? '';
    const value = output[key];
    const count = Array.isArray(value) ? value.length : +(value !== undefined);

    if (param.min && param.min > 0 && count < param.min) {
      throw new OperationOutcomeError(
        serverError(new Error(`Expected ${param.min} or more values for output parameter '${key}', got ${count}`))
      );
    } else if (param.max && param.max !== '*' && count > parseInt(param.max, 10)) {
      throw new OperationOutcomeError(
        serverError(new Error(`Expected at most ${param.max} values for output parameter '${key}', got ${count}`))
      );
    }

    response.parameter?.push(
      ...(Array.isArray(value) ? value.map((v) => makeParameter(param, v)) : [makeParameter(param, value)])
    );
  }

  res.json(response);
}

function makeParameter(param: OperationDefinitionParameter, value: any): ParametersParameter {
  return { name: param.name, ['value' + param.type]: value };
}
