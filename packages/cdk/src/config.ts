import { GetParameterCommand, SSMClient } from '@aws-sdk/client-ssm';
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

const VALID_PRIMITIVE_TYPES = ['string', 'boolean', 'number'];
const ssmClients = {} as Record<string, SSMClient>;

export class InfraConfigNormalizer {
  private config: MedplumSourceInfraConfig;
  private clients: { ssm: SSMClient };
  constructor(config: MedplumSourceInfraConfig) {
    const { region } = config;
    if (!region) {
      throw new OperationOutcomeError(validationError("'region' must be defined as a string literal in config."));
    }
    if (!ssmClients[region]) {
      ssmClients[region] = new SSMClient({ region });
    }
    this.config = config;
    this.clients = { ssm: ssmClients[region] };
  }

  async fetchParameterStoreSecret(key: string): Promise<string> {
    const response = await this.clients.ssm.send(
      new GetParameterCommand({
        Name: key,
        WithDecryption: true,
      })
    );
    const param = response.Parameter;
    if (!param) {
      throw new OperationOutcomeError(
        badRequest(
          `Key '${key}' not found. Make sure your key is correct and that it is defined in your Parameter Store.`
        )
      );
    }
    const paramValue = param.Value;
    if (!paramValue) {
      throw new OperationOutcomeError(
        badRequest(
          `Key '${key}' found but has no value. Make sure your key is correct and that it is defined in your Parameter Store.`
        )
      );
    }
    return paramValue;
  }

  async fetchExternalSecret(externalSecret: ExternalSecret): Promise<ExternalSecretPrimitive> {
    assertValidExternalSecret(externalSecret);
    const { system, key, type } = externalSecret;
    let rawValue: ExternalSecretPrimitive;
    switch (system) {
      case 'aws_ssm_parameter_store': {
        rawValue = await this.fetchParameterStoreSecret(key);
        break;
      }
      default:
        throw new OperationOutcomeError(
          validationError(`Unknown system '${system}' for ExternalSecret. Unable to fetch the secret for key '${key}'.`)
        );
    }
    return normalizeFetchedValue(key, rawValue, type);
  }

  async normalizeInfraConfigArray(currentVal: any[]): Promise<ExternalSecretPrimitive[] | Record<string, any>[]> {
    // ------ case 3a: primitives or `ExternalSecret`
    const firstEle = currentVal[0];
    let newArray: ExternalSecretPrimitive[] | Record<string, any>[];
    if ((typeof firstEle !== 'object' && firstEle !== null) || isExternalSecretLike(firstEle)) {
      newArray = new Array(currentVal.length) as ExternalSecretPrimitive[];
      for (let i = 0; i < currentVal.length; i++) {
        const currIdxVal = currentVal[i] as unknown as ExternalSecretPrimitive | ExternalSecret;
        if (typeof currIdxVal !== 'object') {
          newArray[i] = currIdxVal;
          continue;
        }
        const fetchedVal = await this.fetchExternalSecret(currIdxVal);
        newArray[i] = fetchedVal;
      }
    }
    // ------ case 3b: other objects (recurse)
    else {
      newArray = new Array(currentVal.length) as Record<string, any>[];
      for (let i = 0; i < currentVal.length; i++) {
        newArray[i] = await this.normalizeObjectInInfraConfig(currentVal[i]);
      }
    }
    return newArray;
  }

  async normalizeValueForKey(obj: Record<string, any>, key: string): Promise<void> {
    const currentVal = obj[key];
    // cases:
    // --- case 1: primitive
    if (typeof currentVal !== 'object') {
      obj[key] = currentVal;
    }
    // --- case 2: object conforming to `ExternalSecret` schema
    else if (isExternalSecretLike(currentVal)) {
      obj[key] = await this.fetchExternalSecret(currentVal);
    }
    // --- case 3: an array of:
    else if (Array.isArray(currentVal) && currentVal.length) {
      obj[key] = await this.normalizeInfraConfigArray(currentVal);
    }
    // --- case 4: other object (recurse)
    else if (typeof currentVal === 'object') {
      obj[key] = await this.normalizeObjectInInfraConfig(currentVal);
    }
  }

  async normalizeObjectInInfraConfig(obj: Record<string, any>): Promise<Record<string, any>> {
    const normalizedObj = { ...obj };
    // walk config object
    for (const key of Object.keys(normalizedObj)) {
      await this.normalizeValueForKey(normalizedObj, key);
    }
    return normalizedObj;
  }

  async normalizeConfig(): Promise<MedplumInfraConfig> {
    return this.normalizeObjectInInfraConfig(this.config) as Promise<MedplumInfraConfig>;
  }
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
        `Invalid value found for type; expected either ${VALID_PRIMITIVE_TYPES.join(', or')} but got ${typeOfVal}`
      )
    );
  }
  if (typeOfVal === expectedType) {
    return rawValue;
  } else if (typeOfVal === 'string' && expectedType === 'boolean') {
    const normalized = (rawValue as string).toLowerCase() as 'true' | 'false';
    if (normalized !== 'true' && normalized !== 'false') {
      throw new OperationOutcomeError(
        validationError(`Invalid value found for key '${key}'; expected boolean value but got '${rawValue}'`)
      );
    }
    return normalized === 'true';
  } else if (typeOfVal === 'string' && expectedType === 'number') {
    const parsed = parseInt(rawValue as string, 10);
    if (Number.isNaN(parsed)) {
      throw new OperationOutcomeError(
        validationError(`Invalid value found for key '${key}'; expected integer value but got '${rawValue}'`)
      );
    }
    return parsed;
  } else {
    throw new OperationOutcomeError(
      validationError(`Invalid value found for type; expected ${expectedType} value but got value of type ${typeOfVal}`)
    );
  }
}

export function isExternalSecretLike(obj: Record<string, any>): obj is ExternalSecret {
  return (
    typeof obj === 'object' &&
    typeof obj.system === 'string' &&
    typeof obj.key === 'string' &&
    typeof obj.type === 'string'
  );
}

export function isExternalSecret(obj: Record<string, any>): obj is ExternalSecret {
  return (
    typeof obj === 'object' &&
    typeof obj.system === 'string' &&
    typeof obj.key === 'string' &&
    VALID_PRIMITIVE_TYPES.includes(obj.type)
  );
}

export function assertValidExternalSecret(obj: Record<string, any>): asserts obj is ExternalSecret {
  if (!isExternalSecret(obj)) {
    throw new OperationOutcomeError(
      validationError('obj is not a valid `ExternalSecret`, must contain a valid `system`, `key`, and `type` prop.')
    );
  }
}

export async function normalizeInfraConfig(config: MedplumSourceInfraConfig): Promise<MedplumInfraConfig> {
  return new InfraConfigNormalizer(config).normalizeConfig();
}
