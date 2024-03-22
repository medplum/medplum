import { OperationOutcomeError, badRequest, capitalize, isEmpty, isResource, validateResource } from '@medplum/core';
import { FhirRequest } from '@medplum/fhir-router';
import { OperationDefinition, OperationDefinitionParameter, Parameters, ParametersParameter } from '@medplum/fhirtypes';
import { Request } from 'express';

export function parseParameters<T>(input: T | Parameters): T {
  if (input && typeof input === 'object' && 'resourceType' in input && input.resourceType === 'Parameters') {
    // Convert the parameters to input
    const parameters = (input as Parameters).parameter ?? [];
    return Object.fromEntries(parameters.map((p) => [p.name, p.valueString])) as T;
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
export function parseInputParameters<T>(operation: OperationDefinition, req: Request | FhirRequest): T {
  if (!operation.parameter) {
    return {} as any;
  }
  const inputParameters = operation.parameter.filter((p) => p.use === 'in');

  // If the request is a GET request, use the query parameters
  // Otherwise, use the body
  const input = req.method === 'GET' ? parseQueryString(req.query, inputParameters) : req.body;

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

function parseQueryString(
  query: Record<string, any>,
  inputParams: OperationDefinitionParameter[]
): Record<string, any> {
  const parsed = Object.create(null);
  for (const param of inputParams) {
    const value = query[param.name];
    if (!value) {
      continue;
    }
    if (param.part || param.type?.match(/^[A-Z]/)) {
      // Query parameters cannot contain complex types
      throw new OperationOutcomeError(
        badRequest(`Complex parameter ${param.name} (${param.type}) cannot be passed via query string`)
      );
    }

    switch (param.type) {
      case 'integer':
      case 'positiveInt':
      case 'unsignedInt': {
        const n = parseInt(value, 10);
        if (isNaN(n)) {
          throw new OperationOutcomeError(badRequest(`Invalid value '${value}' provided for ${param.type} parameter`));
        }
        parsed[param.name] = n;
        break;
      }
      case 'decimal': {
        const n = parseFloat(value);
        if (isNaN(n)) {
          throw new OperationOutcomeError(badRequest(`Invalid value '${value}' provided for ${param.type} parameter`));
        }
        parsed[param.name] = n;
        break;
      }
      case 'boolean':
        if (value === 'true') {
          parsed[param.name] = true;
        } else if (value === 'false') {
          parsed[param.name] = false;
        } else {
          throw new OperationOutcomeError(badRequest(`Invalid value '${value}' provided for ${param.type} parameter`));
        }
        break;
      default:
        parsed[param.name] = value;
    }
  }
  return parsed;
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

export function buildOutputParameters(operation: OperationDefinition, output: any): Parameters {
  const outputParameters = operation.parameter?.filter((p) => p.use === 'out');
  const param1 = outputParameters?.[0];
  if (outputParameters?.length === 1 && param1 && param1.name === 'return') {
    if (!isResource(output) || (param1.type && output.resourceType !== param1.type)) {
      throw new Error(`Expected ${param1.type ?? 'Resource'} output, but got unexpected ${typeof output}`);
    } else {
      // Send Resource as output directly, instead of using Parameters format
      return output as Parameters;
    }
  }
  const response: Parameters = {
    resourceType: 'Parameters',
  };
  if (!outputParameters?.length) {
    // Send empty Parameters as response
    return response;
  }

  response.parameter = [];
  for (const param of outputParameters) {
    const key = param.name ?? '';
    const value = output[key];
    const count = Array.isArray(value) ? value.length : +(value !== undefined);

    if (param.min && param.min > 0 && count < param.min) {
      throw new Error(`Expected ${param.min} or more values for output parameter '${key}', got ${count}`);
    } else if (param.max && param.max !== '*' && count > parseInt(param.max, 10)) {
      throw new Error(`Expected at most ${param.max} values for output parameter '${key}', got ${count}`);
    } else if (isEmpty(value)) {
      continue;
    }

    if (Array.isArray(value)) {
      for (const val of value.map((v) => makeParameter(param, v))) {
        if (val) {
          response.parameter.push(val);
        }
      }
    } else {
      const val = makeParameter(param, value);
      if (val) {
        response.parameter.push(val);
      }
    }
  }

  validateResource(response);
  return response;
}

function makeParameter(param: OperationDefinitionParameter, value: any): ParametersParameter | undefined {
  if (param.part) {
    const parts: ParametersParameter[] = [];
    for (const part of param.part) {
      const nestedValue = value[part.name ?? ''];
      if (nestedValue !== undefined) {
        const nestedParam = makeParameter(part, nestedValue);
        if (nestedParam) {
          parts.push(nestedParam);
        }
      }
    }
    return { name: param.name, part: parts };
  }
  const type =
    param.type && param.type !== 'Element'
      ? [param.type]
      : param.extension
          ?.filter((e) => e.url === 'http://hl7.org/fhir/StructureDefinition/operationdefinition-allowed-type')
          ?.map((e) => e.valueUri as string);
  if (type?.length === 1) {
    return { name: param.name, ['value' + capitalize(type[0] as string)]: value };
  } else if (typeof value.type === 'string' && value.value && type?.length) {
    // Handle TypedValue
    for (const t of type) {
      if (value.type === t) {
        return { name: param.name, ['value' + capitalize(t)]: value.value };
      }
    }
  }
  return undefined;
}

export function clamp(n: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, n));
}
