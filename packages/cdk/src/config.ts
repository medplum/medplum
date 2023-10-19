import { GetParametersByPathCommand, SSMClient } from '@aws-sdk/client-ssm';
import {
  ExternalSecret,
  MedplumInfraConfig,
  MedplumSourceInfraConfig,
  OperationOutcomeError,
  badRequest,
  validationError,
} from '@medplum/core';

const DEFAULT_AWS_REGION = 'us-east-1';

export async function fetchParameterStoreSecret(path: string, key: string): Promise<string> {
  const region = DEFAULT_AWS_REGION;
  const client = new SSMClient({ region });

  let nextToken: string | undefined;
  do {
    const response = await client.send(
      new GetParametersByPathCommand({
        Path: path,
        NextToken: nextToken,
        WithDecryption: true,
      })
    );
    if (response.Parameters) {
      for (const param of response.Parameters) {
        const paramKey = (param.Name as string).replace(path, '');
        if (paramKey === key) {
          if (!param.Value) {
            throw new OperationOutcomeError(badRequest(`Key ${key} found in path ${path} but missing a value.`));
          }
          return param.Value;
        }
      }
    }
    nextToken = response.NextToken;
  } while (nextToken);

  throw new OperationOutcomeError(
    badRequest(
      `Key ${key} not found at path ${path}. Make sure your path and key are correct and are defined in your Parameter Store.`
    )
  );
}

function normalizeFetchedValue(
  key: string,
  rawValue: string | boolean | number,
  expectedType: 'string' | 'boolean' | 'number'
): string | boolean | number {
  const typeOfVal = typeof rawValue;
  // Return raw type if type is string and value is of type string, or if type isn't string and typeof val isn't string
  if (!['string', 'boolean', 'number'].includes(typeOfVal)) {
    throw new OperationOutcomeError(
      validationError(
        `Invalid value found for type, expected 'string' or 'boolean' or 'number', received: '${typeOfVal}'`
      )
    );
  }
  if (expectedType === 'string' && typeOfVal === 'string') {
    return rawValue;
  } else if (expectedType !== 'string' && typeOfVal !== 'string') {
    return rawValue;
  } else if (expectedType === 'boolean' && typeOfVal === 'string') {
    const normalized = (rawValue as string).toLowerCase() as 'true' | 'false';
    if (normalized !== 'true' && normalized !== 'false') {
      throw new OperationOutcomeError(
        validationError(`Invalid value found for key '${key}', expected boolean value but got '${rawValue}'`)
      );
    }
    return normalized === 'true';
  } else if (expectedType === 'number' && typeOfVal === 'string') {
    const parsed = parseInt(rawValue as string, 10);
    if (Number.isNaN(parsed)) {
      throw new OperationOutcomeError(
        validationError(`Invalid value found for key '${key}', expected integer value but got '${rawValue}'`)
      );
    }
    return parsed;
  } else {
    throw new OperationOutcomeError(
      validationError(`Invalid value found for type, expected '${expectedType}', received: '${typeOfVal}'`)
    );
  }
}

export async function fetchExternalSecret(
  externalSecret: ExternalSecret<'string' | 'boolean' | 'number'>
): Promise<string | number | boolean> {
  const { system, key, type } = externalSecret;
  let rawValue: string | boolean | number;
  switch (system) {
    case 'aws_ssm_parameter_store': {
      const [paramPath, paramKey] = key.split(':');
      if (!(paramPath && paramKey)) {
        throw new OperationOutcomeError(
          validationError(
            'Keys for AWS Param Store secrets must be a path followed by a ":" and a key. (/path/to/param:my_key)'
          )
        );
      }
      rawValue = await fetchParameterStoreSecret(paramPath, paramKey);
      break;
    }
    default:
      throw new Error(`Unknown system '${system}' for ExternalSecret. Unable to fetch the secret for key '${key}'.`);
  }
  return normalizeFetchedValue(key, rawValue, type);
}

export async function normalizeObjectInInfraConfig(obj: Record<string, any>): Promise<Record<string, any>> {
  const normalizedObj = {};
  // walk config object
  for (const key in obj) {
    if (Object.hasOwn(obj, key)) {
      const currentVal = obj[key];
      // cases:
      // --- case 1: primitive
      if (typeof currentVal !== 'object') {
        // @ts-expect-error Unable to match type info for keys generically at runtime
        normalizedObj[key] = currentVal;
      }
      // --- case 2: object conforming to `ExternalSecret` schema
      else if (isExternalSecret(currentVal)) {
        // @ts-expect-error Unable to match type info for keys generically at runtime
        normalizedObj[key] = await fetchExternalSecret(currentVal);
      }
      // --- case 3: an array of:
      else if (Array.isArray(currentVal) && currentVal.length) {
        // ------ case 3a: primitives or `ExternalSecret`
        const firstEle = currentVal[0];
        if ((typeof firstEle !== 'object' && firstEle !== null) || isExternalSecret(firstEle)) {
          const newArray = new Array(currentVal.length) as (string | number | boolean)[];
          for (let i = 0; i < currentVal.length; i++) {
            const currIdxVal = currentVal[i] as unknown as
              | string
              | boolean
              | number
              | ExternalSecret<'string' | 'boolean' | 'number'>;
            if (typeof currIdxVal !== 'object') {
              newArray[i] = currIdxVal;
              continue;
            }
            const fetchedVal = await fetchExternalSecret(currIdxVal);
            newArray[i] = fetchedVal;
          }
          // @ts-expect-error Unable to match type info for keys generically at runtime
          normalizedObj[key] = newArray;
        }
        // ------ case 3b: other objects (recurse)
        else {
          const newArray = new Array(currentVal.length) as Record<string, any>[];
          for (let i = 0; i < currentVal.length; i++) {
            newArray[i] = await normalizeObjectInInfraConfig(currentVal[i]);
          }
          // @ts-expect-error Unable to match type info for keys generically at runtime
          normalizedObj[key] = newArray;
        }
      }
      // --- case 4: other object (recurse)
      else if (typeof currentVal === 'object') {
        // @ts-expect-error Unable to match type info for keys generically at runtime
        normalizedObj[key] = await normalizeObjectInInfraConfig(currentVal);
      }
    }
  }
  return normalizedObj;
}

export function isExternalSecret(obj: Record<string, any>): obj is ExternalSecret<'boolean' | 'number' | 'string'> {
  return (
    typeof obj === 'object' &&
    typeof obj.system === 'string' &&
    typeof obj.key === 'string' &&
    (obj.type === 'string' || obj.type === 'boolean' || obj.type === 'number')
  );
}

// TODO: Don't use partials???
export async function normalizeInfraConfig(
  config: Partial<MedplumSourceInfraConfig>
): Promise<Partial<MedplumInfraConfig>> {
  return normalizeObjectInInfraConfig(config) as Promise<Partial<MedplumInfraConfig>>;
}
