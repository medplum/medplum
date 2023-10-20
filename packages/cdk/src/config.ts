import { GetParametersByPathCommand, SSMClient } from '@aws-sdk/client-ssm';
import {
  ExternalSecret,
  ExternalSecretPrimitive,
  ExternalSecretPrimitiveType,
  MedplumInfraConfig,
  MedplumSourceInfraConfig,
  OperationOutcomeError,
  badRequest,
  validationError,
} from '@medplum/core';

const DEFAULT_AWS_REGION = 'us-east-1';
const VALID_PRIMITIVE_TYPES = ['string', 'boolean', 'number'];

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
            throw new OperationOutcomeError(badRequest(`Key '${key}' found in path '${path}' but missing a value.`));
          }
          return param.Value;
        }
      }
    }
    nextToken = response.NextToken;
  } while (nextToken);

  throw new OperationOutcomeError(
    badRequest(
      `Key '${key}' not found at path '${path}'. Make sure your path and key are correct and are defined in your Parameter Store.`
    )
  );
}

export function normalizeFetchedValue(
  key: string,
  rawValue: ExternalSecretPrimitive,
  expectedType: ExternalSecretPrimitiveType
): ExternalSecretPrimitive {
  const typeOfVal = typeof rawValue;
  // Return raw type if type is string and value is of type string, or if type isn't string and typeof val isn't string
  if (!VALID_PRIMITIVE_TYPES.includes(typeOfVal)) {
    throw new OperationOutcomeError(
      validationError(
        `Invalid value found for type, expected 'string' or 'boolean' or 'number', received: '${typeOfVal}'`
      )
    );
  }
  if (expectedType === 'string' && typeOfVal === 'string') {
    return rawValue;
  } else if (expectedType !== 'string' && typeOfVal === expectedType) {
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

export async function fetchExternalSecret(externalSecret: ExternalSecret): Promise<ExternalSecretPrimitive> {
  assertValidExternalSecret(externalSecret);
  const { system, key, type } = externalSecret;
  let rawValue: ExternalSecretPrimitive;
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
      throw new OperationOutcomeError(
        validationError(`Unknown system '${system}' for ExternalSecret. Unable to fetch the secret for key '${key}'.`)
      );
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
      else if (isExternalSecretLike(currentVal)) {
        // @ts-expect-error Unable to match type info for keys generically at runtime
        normalizedObj[key] = await fetchExternalSecret(currentVal);
      }
      // --- case 3: an array of:
      else if (Array.isArray(currentVal) && currentVal.length) {
        // ------ case 3a: primitives or `ExternalSecret`
        const firstEle = currentVal[0];
        if ((typeof firstEle !== 'object' && firstEle !== null) || isExternalSecretLike(firstEle)) {
          const newArray = new Array(currentVal.length) as (string | number | boolean)[];
          for (let i = 0; i < currentVal.length; i++) {
            const currIdxVal = currentVal[i] as unknown as string | boolean | number | ExternalSecret;
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

export function isExternalSecretLike(obj: Record<string, any>): obj is ExternalSecret {
  return (
    typeof obj === 'object' &&
    typeof obj.system === 'string' &&
    typeof obj.key === 'string' &&
    typeof obj.type === 'string'
  );
}

export function assertValidExternalSecret(obj: Record<string, any>): asserts obj is ExternalSecret {
  if (
    typeof obj !== 'object' ||
    typeof obj.system !== 'string' ||
    typeof obj.key !== 'string' ||
    typeof obj.type !== 'string'
  ) {
    throw new OperationOutcomeError(
      validationError('obj is not a valid `ExternalSecret`, must contain a valid `system`, `key`, and `type` prop.')
    );
  }
  if (!VALID_PRIMITIVE_TYPES.includes(obj.type)) {
    throw new OperationOutcomeError(
      validationError(`'${obj.type}' is not a valid primitive type. Must be one of ${VALID_PRIMITIVE_TYPES.join(',')}`)
    );
  }
}

export function isExternalSecret(obj: Record<string, any>): obj is ExternalSecret {
  return (
    typeof obj === 'object' &&
    typeof obj.system === 'string' &&
    typeof obj.key === 'string' &&
    VALID_PRIMITIVE_TYPES.includes(obj.type)
  );
}

export async function normalizeInfraConfig(config: MedplumSourceInfraConfig): Promise<MedplumInfraConfig> {
  return normalizeObjectInInfraConfig(config) as Promise<MedplumInfraConfig>;
}
