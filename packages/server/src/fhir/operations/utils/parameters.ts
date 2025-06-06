import {
  OperationOutcomeError,
  badRequest,
  capitalize,
  flatMapFilter,
  isEmpty,
  isResource,
  isTypedValue,
  validateResource,
} from '@medplum/core';
import { FhirRequest } from '@medplum/fhir-router';
import {
  OperationDefinition,
  OperationDefinitionParameter,
  Parameters,
  ParametersParameter,
  ResourceType,
} from '@medplum/fhirtypes';
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
    return {} as T;
  }
  const inputParameters = operation.parameter.filter((p) => p.use === 'in');

  // If the request is a GET request, use the query parameters
  // Otherwise, use the body
  const input = req.method === 'GET' ? parseQueryString(req.query, inputParameters) : req.body;

  if (input.resourceType === 'Parameters') {
    if (!input.parameter) {
      return {} as T;
    }
    validateResource(input as Parameters);
    return parseParams(inputParameters, input.parameter) as T;
  } else {
    return Object.fromEntries(
      inputParameters.map((param) => [param.name, validateInputParam(param, input[param.name as string])])
    ) as T;
  }
}

function parseQueryString(
  query: Record<string, unknown> | undefined,
  inputParams: OperationDefinitionParameter[]
): Record<string, unknown> {
  const parsed = Object.create(null);
  if (!query) {
    return parsed;
  }

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

    parsed[param.name] = Array.isArray(value)
      ? value.map((v) => parseStringifiedParameter(v, param))
      : parseStringifiedParameter(value, param);
  }
  return parsed;
}

function parseStringifiedParameter(
  value: unknown,
  param: OperationDefinitionParameter
): number | boolean | string | undefined {
  if (typeof value !== 'string') {
    return undefined;
  }

  switch (param.type) {
    case 'integer':
    case 'positiveInt':
    case 'unsignedInt':
      {
        const n = parseInt(value, 10);
        if (!isNaN(n)) {
          return n;
        }
      }
      break;
    case 'decimal':
      {
        const n = parseFloat(value);
        if (!isNaN(n)) {
          return n;
        }
      }
      break;
    case 'boolean':
      if (value === 'true') {
        return true;
      } else if (value === 'false') {
        return false;
      }
      break;
    default:
      return value;
  }

  throw new OperationOutcomeError(
    badRequest(`Invalid value '${value}' provided for ${param.type} parameter '${param.name}'`)
  );
}

function validateInputParam(param: OperationDefinitionParameter, value: unknown): unknown {
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
): Record<string, unknown> {
  const parsed: Record<string, unknown> = Object.create(null);
  for (const param of params) {
    // FHIR spec-compliant case: Parameters resource e.g.
    // { resourceType: 'Parameters', parameter: [{ name: 'message', valueString: 'Hello!' }] }
    // except for Resource parameters, where the value is a whole resource.
    const inParams = inputParameters.filter((p) => p.name === param.name);
    let value: unknown;
    if (param.part?.length) {
      value = inParams.map((input) => parseParams(param.part as [], input.part ?? []));
    } else {
      value = inParams?.map((v) => {
        const paramType = param.type ?? 'string';
        if (paramType === 'Resource') {
          return v.resource;
        } else {
          return v[('value' + capitalize(paramType)) as keyof ParametersParameter];
        }
      });
    }
    parsed[param.name] = validateInputParam(param, value);
  }

  return parsed;
}

export function buildOutputParameters(operation: OperationDefinition, output: object | undefined): Parameters {
  const outputParameters = operation.parameter?.filter((p) => p.use === 'out');
  const param1 = outputParameters?.[0];
  if (outputParameters?.length === 1 && param1 && param1.name === 'return') {
    if (!isResource(output, param1.type as ResourceType | undefined)) {
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
    const value = (output as Record<string, unknown> | undefined)?.[key];
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

function makeParameter(param: OperationDefinitionParameter, value: unknown): ParametersParameter | undefined {
  if (param.part && value && typeof value === 'object') {
    // Handle nested parameters by flattening dictionary object value
    const parts: ParametersParameter[] = [];
    for (const part of param.part) {
      const nestedValue = (value as Record<string, unknown>)[part.name ?? ''];
      if (nestedValue !== undefined) {
        const nestedParam = makeParameter(part, nestedValue);
        if (nestedParam) {
          parts.push(nestedParam);
        }
      }
    }

    return { name: param.name, part: parts };
  }

  const type = getParameterType(param);
  if (type?.length === 1) {
    return { name: param.name, ['value' + capitalize(type[0])]: value };
  } else if (isTypedValue(value) && value.value !== undefined && type?.length) {
    // Handle TypedValue
    for (const t of type) {
      if (value.type === t) {
        return { name: param.name, ['value' + capitalize(t)]: value.value };
      }
    }
  }
  return undefined;
}

function getParameterType(param: OperationDefinitionParameter): string[] | undefined {
  if (param.type && param.type !== 'Element') {
    return [param.type];
  }
  return flatMapFilter(param.extension, (e) =>
    e.url === 'http://hl7.org/fhir/StructureDefinition/operationdefinition-allowed-type'
      ? (e.valueUri as string)
      : undefined
  );
}

/**
 * Clamps a value between minimum and maximum values.
 * @param min - The minimum value.
 * @param n - The value to be clamped.
 * @param max - The maximum value.
 * @returns - The value, constrained to be at least min and at most max.
 */
export function clamp(min: number, n: number, max: number): number {
  return Math.max(min, Math.min(max, n));
}
