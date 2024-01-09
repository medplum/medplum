import {
  OperationOutcomeError,
  badRequest,
  capitalize,
  getStatus,
  isEmpty,
  isResource,
  serverError,
  validateResource,
} from '@medplum/core';
import {
  OperationDefinition,
  OperationDefinitionParameter,
  OperationOutcome,
  Parameters,
  ParametersParameter,
} from '@medplum/fhirtypes';
import { Request, Response } from 'express';
import { sendResponse } from '../../routes';
import { sendOutcome } from '../../outcomes';

export function parseParameters<T>(input: T | Parameters): T {
  if (input && typeof input === 'object' && 'resourceType' in input && input.resourceType === 'Parameters') {
    // Convert the parameters to input
    const parameters = (input as Parameters).parameter ?? [];
    return Object.fromEntries(parameters.map((p) => [p.name, p.valueString]));
  } else {
    return input as T;
  }
}

/**
 * Parse an incoming Operation request and extract the defined input parameters into a dictionary object.
 *
 * @param operation - The Operation for which the request is intended.
 * @param req - The incoming request.
 * @returns A dictionary of parameter names to values.
 */
export function parseInputParameters<T>(operation: OperationDefinition, req: Request): T {
  if (!operation.parameter) {
    return {} as any;
  }

  const input = req.body;
  const inputParameters = operation.parameter.filter((p) => p.use === 'in');
  if (input.resourceType === 'Parameters') {
    if (!input.parameter) {
      return {} as any;
    }
    validateResource(input as Parameters);
    return parseParams(inputParameters, input.parameter) as any;
  } else {
    return Object.fromEntries(
      inputParameters.map((param) => [param.name, validateInputParam(param, input[param.name as string])])
    ) as any;
  }
}

function validateInputParam(param: OperationDefinitionParameter, value: any): any {
  // Check parameter cardinality (min and max)
  const min = param.min ?? 0;
  const max = parseInt(param.max ?? '1', 10);
  if (Array.isArray(value)) {
    if (value.length < min || value.length > max) {
      throw new OperationOutcomeError(
        badRequest(
          `Expected ${min === max ? max : min + '..' + max} value(s) for input parameter ${param.name}, but ${
            value.length
          } provided`
        )
      );
    }
  } else if (min > 0 && isEmpty(value)) {
    throw new OperationOutcomeError(
      badRequest(`Expected at least ${min} value(s) for required input parameter '${param.name}'`)
    );
  }

  return Array.isArray(value) && max === 1 ? value[0] : value;
}

function parseParams(
  params: OperationDefinitionParameter[],
  inputParameters: ParametersParameter[]
): Record<string, any> {
  const parsed: Record<string, any> = Object.create(null);
  for (const param of params) {
    // FHIR spec-compliant case: Parameters resource e.g.
    // { resourceType: 'Parameters', parameter: [{ name: 'message', valueString: 'Hello!' }] }
    const inParams = inputParameters.filter((p) => p.name === param.name);
    let value: any;
    if (param.part?.length) {
      value = inParams.map((input) => parseParams(param.part as [], input.part ?? []));
    } else {
      value = inParams?.map((v) => v[('value' + capitalize(param.type ?? 'string')) as keyof ParametersParameter]);
    }

    parsed[param.name as string] = validateInputParam(param, value);
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
    if (!isResource(output) || (param1.type && output.resourceType !== param1.type)) {
      sendOutcome(
        res,
        serverError(new Error(`Expected ${param1.type ?? 'Resource'} output, but got unexpected ${typeof output}`))
      );
    } else {
      // Send Resource as output directly, instead of using Parameters format
      await sendResponse(res, outcome, output);
    }
    return;
  }
  const response: Parameters = {
    resourceType: 'Parameters',
  };
  if (!outputParameters?.length) {
    // Send empty Parameters as response
    res.status(getStatus(outcome)).json(response);
    return;
  }

  response.parameter = [];
  for (const param of outputParameters) {
    const key = param.name ?? '';
    const value = output[key];
    const count = Array.isArray(value) ? value.length : +(value !== undefined);

    if (param.min && param.min > 0 && count < param.min) {
      sendOutcome(
        res,
        serverError(new Error(`Expected ${param.min} or more values for output parameter '${key}', got ${count}`))
      );
      return;
    } else if (param.max && param.max !== '*' && count > parseInt(param.max, 10)) {
      sendOutcome(
        res,
        serverError(new Error(`Expected at most ${param.max} values for output parameter '${key}', got ${count}`))
      );
      return;
    } else if (isEmpty(value)) {
      continue;
    }

    response.parameter?.push(
      ...(Array.isArray(value) ? value.map((v) => makeParameter(param, v)) : [makeParameter(param, value)])
    );
  }

  try {
    validateResource(response);
    res.status(getStatus(outcome)).json(response);
  } catch (err: any) {
    sendOutcome(res, serverError(err));
  }
}

function makeParameter(param: OperationDefinitionParameter, value: any): ParametersParameter {
  if (param.part) {
    const parts: ParametersParameter[] = [];
    for (const part of param.part) {
      const nestedValue = value[part.name ?? ''];
      if (nestedValue !== undefined) {
        parts.push(makeParameter(part, nestedValue));
      }
    }
    return { name: param.name, part: parts };
  }
  return { name: param.name, ['value' + capitalize(param.type as string)]: value };
}
