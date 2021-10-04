import { Request, Response } from 'express';
import { JSONSchema4 } from 'json-schema';
import { ComponentsObject, OpenAPIObject, ReferenceObject, SchemaObject, SecurityRequirementObject, TagObject } from 'openapi3-ts';
import { getConfig } from './config';
import { getSchemaDefinitions } from './fhir';

const whitelist = [
  'Account',
  'Account_Coverage',
  'Account_Guarantor',
  'ActivityDefinition',
  'Address',
  'Age',
  'Annotation',
  'Attachment',
  'CodeableConcept',
  'Coding',
  'ContactDetail',
  'ContactPoint',
  'Contributor',
  'Count',
  'DataRequirement',
  'DataRequirement_CodeFilter',
  'DataRequirement_DateFilter',
  'DataRequirement_Sort',
  'Distance',
  'Dosage',
  'Dosage_DoseAndRate',
  'Duration',
  'Element',
  'Expression',
  'Extension',
  'HumanName',
  'Identifier',
  'Meta',
  'Money',
  'Narrative',
  'Observation',
  'Observation_Component',
  'Observation_ReferenceRange',
  'ParameterDefinition',
  'Patient',
  'Period',
  'Quantity',
  'Range',
  'Ratio',
  'Reference',
  'RelatedArtifact',
  'ResourceList',
  'SampledData',
  'Signature',
  'Timing',
  'Timing_Repeat',
  'TriggerDefinition',
  'UsageContext',
  'base64Binary',
  'base64Binary',
  'boolean',
  'canonical',
  'code',
  'dateTime',
  'decimal',
  'id',
  'instant',
  'integer',
  'markdown',
  'positiveInt',
  'string',
  'time',
  'time',
  'unsignedInt',
  'unsignedInt',
  'uri',
  'url',
  'xhtml',
];

type SchemaMap = { [schema: string]: SchemaObject | ReferenceObject; };

let cachedSpec: any;

export const openApiHandler = (req: Request, res: Response) => {
  res.status(200).json(getSpec());
};

function getSpec(): any {
  if (!cachedSpec) {
    cachedSpec = buildSpec();
  }
  return cachedSpec;
}

function buildSpec(): any {
  const result = buildBaseSpec();
  const definitions = getSchemaDefinitions();
  Object.entries(definitions).forEach(([name, definition]) => buildFhirType(result, name, definition));
  return result;
}

/**
 * Builds the base structure of the OpenAPI specification.
 * See: https://swagger.io/specification/
 */
function buildBaseSpec(): OpenAPIObject {
  const config = getConfig();
  return {
    openapi: '3.0.2',
    info: {
      title: 'Medplum - OpenAPI 3.0',
      description: 'Medplum OpenAPI 3.0 specification.  You can find out more about Medplum at [https://www.medplum.com](https://www.medplum.com).',
      termsOfService: 'https://www.medplum.com/docs/terms/',
      contact: {
        email: 'hello@medplum.com'
      },
      license: {
        name: 'Apache 2.0',
        url: 'https://www.apache.org/licenses/LICENSE-2.0.html'
      },
      version: '1.0.5'
    },
    externalDocs: {
      description: 'Find out more about Medplum',
      url: 'https://www.medplum.com/'
    },
    servers: [
      {
        url: config.baseUrl
      }
    ],
    security: buildSecurity(),
    tags: [],
    paths: {},
    components: {
      schemas: {},
      securitySchemes: {
        OAuth2: {
          type: 'oauth2',
          flows: {
            authorizationCode: {
              authorizationUrl: config.authorizeUrl,
              tokenUrl: config.tokenUrl,
              scopes: {
                openid: 'OpenID'
              }
            }
          }
        }
      }
    }
  };
}

/**
 * Builds the OpenAPI security defintions.
 * @returns The OpenAPI security defintions.
 */
function buildSecurity(): SecurityRequirementObject[] {
  return [{
    OAuth2: ['openid']
  }];
}

/**
 * Builds the OpenAPI specification details for a FHIR type.
 * @param result The OpenAPI specification output.
 * @param typeName The FHIR type name.
 * @param typeDefinition The FHIR type definition.
 */
function buildFhirType(result: OpenAPIObject, typeName: string, typeDefinition: JSONSchema4): void {
  if (whitelist.includes(typeName)) {
    buildSchema(result, typeName, typeDefinition);
    if (hasEndpoint(typeDefinition)) {
      buildTags(result, typeName, typeDefinition);
      buildPaths(result, typeName);
    }
  }
}

/**
 * Builds the schema for a FHIR type.
 * See: https://swagger.io/specification/#schema-object
 * @param result The OpenAPI specification output.
 * @param typeName The FHIR type name.
 * @param typeDefinition The FHIR type definition.
 */
function buildSchema(result: OpenAPIObject, typeName: string, typeDefinition: JSONSchema4): void {
  ((result.components as ComponentsObject).schemas as SchemaMap)[typeName] = buildObjectSchema(typeName, typeDefinition);
}

/**
 * Converts a JSONSchema type definition to an OpenAPI type definition.
 * @param name The type name.
 * @param definition The JSONSchema type definition.
 * @returns The OpenAPI type definition.
 */
function buildObjectSchema(name: string, definition: JSONSchema4): SchemaObject {
  return JSON.parse(JSON.stringify(definition, refReplacer));
}

/**
 * Replaces JSONSchema references with OpenAPI references.
 * Can be used as 2nd parameter in JSON.stringify.
 * @param key The JSON property key.
 * @param value The JSON property value.
 * @returns The updated JSON property value.
 */
function refReplacer(key: string, value: any): any {
  if (key === '$ref') {
    return (value as string).replace('#/definitions/', '#/components/schemas/');
  }
  if (key === 'oneOf' || key === 'extension' || key === '_extension') {
    return undefined;
  }
  return value;
}

/**
 * Builds the tags for a FHIR type.
 * See: https://swagger.io/specification/#tag-object
 * @param result The OpenAPI specification output.
 * @param typeName The FHIR type name.
 * @param typeDefinition The FHIR type definition.
 */
function buildTags(result: OpenAPIObject, typeName: string, typeDefinition: JSONSchema4): void {
  (result.tags as TagObject[]).push({
    name: typeName,
    description: typeDefinition.description,
    externalDocs: {
      url: 'https://docs.medplum.com/fhir/R4/' + typeName
    }
  });
}

/**
 * Builds the paths for a FHIR resource type.
 * @param result The OpenAPI specification output.
 * @param resourceType The FHIR resource type.
 */
function buildPaths(result: OpenAPIObject, resourceType: string): void {
  result.paths[`/fhir/R4/${resourceType}`] = {
    get: buildSearchPath(resourceType),
    post: buildCreatePath(resourceType)
  };

  result.paths[`/fhir/R4/${resourceType}/{id}`] = {
    get: buildReadPath(resourceType),
    put: buildUpdatePath(resourceType),
    delete: buildDeletePath(resourceType),
    patch: buildPatchPath(resourceType)
  };

  result.paths[`/fhir/R4/${resourceType}/{id}/_history`] = {
    get: buildReadHistoryPath(resourceType)
  };

  result.paths[`/fhir/R4/${resourceType}/{id}/_history/{versionId}`] = {
    get: buildReadVersionPath(resourceType)
  };
}

function buildSearchPath(resourceType: string): any {
  return {
    tags: [resourceType],
    summary: 'Search ' + resourceType,
    description: 'Search ' + resourceType,
    operationId: 'search' + resourceType,
    security: {
      OAuth2: ['openid']
    },
    responses: {
      '200': {
        description: 'Success',
        content: {
          'application/fhir+json': {
            schema: {
              $ref: '#/components/schemas/Bundle'
            }
          }
        }
      }
    }
  };
}

function buildCreatePath(resourceType: string): any {
  return {
    tags: [resourceType],
    summary: 'Create ' + resourceType,
    description: 'Create ' + resourceType,
    operationId: 'create' + resourceType,
    security: {
      OAuth2: ['openid']
    },
    requestBody: {
      description: 'Create ' + resourceType,
      content: {
        'application/fhir+json': {
          schema: {
            $ref: '#/components/schemas/' + resourceType
          }
        }
      },
      required: true
    },
    responses: {
      '201': {
        description: 'Success',
        content: {
          'application/fhir+json': {
            schema: {
              $ref: '#/components/schemas/' + resourceType
            }
          }
        }
      }
    }
  };
}

function buildReadPath(resourceType: string): any {
  return {
    tags: [resourceType],
    summary: 'Read ' + resourceType,
    description: 'Read ' + resourceType,
    operationId: 'read' + resourceType,
    security: {
      OAuth2: ['openid']
    },
    parameters: [
      {
        name: 'id',
        in: 'path',
        description: resourceType + ' ID',
        required: true,
        schema: {
          type: 'string',
          format: 'uuid'
        }
      }
    ],
    responses: {
      '200': {
        description: 'Success',
        content: {
          'application/fhir+json': {
            schema: {
              $ref: '#/components/schemas/' + resourceType
            }
          }
        }
      }
    }
  };
}

function buildReadHistoryPath(resourceType: string): any {
  return {
    tags: [resourceType],
    summary: 'Read ' + resourceType + ' History',
    description: 'Read ' + resourceType + ' History',
    operationId: 'read' + resourceType + 'History',
    security: {
      OAuth2: ['openid']
    },
    parameters: [
      {
        name: 'id',
        in: 'path',
        description: resourceType + ' ID',
        required: true,
        schema: {
          type: 'string',
          format: 'uuid'
        }
      }
    ],
    responses: {
      '200': {
        description: 'Success',
        content: {
          'application/fhir+json': {
            schema: {
              $ref: '#/components/schemas/Bundle'
            }
          }
        }
      }
    }
  };
}

function buildReadVersionPath(resourceType: string): any {
  return {
    tags: [resourceType],
    summary: 'Read ' + resourceType + ' Version',
    description: 'Read ' + resourceType + ' Version',
    operationId: 'read' + resourceType + 'Version',
    security: {
      OAuth2: ['openid']
    },
    parameters: [
      {
        name: 'id',
        in: 'path',
        description: resourceType + ' ID',
        required: true,
        schema: {
          type: 'string',
          format: 'uuid'
        }
      }
    ],
    responses: {
      '200': {
        description: 'Success',
        content: {
          'application/fhir+json': {
            schema: {
              $ref: '#/components/schemas/' + resourceType
            }
          }
        }
      }
    }
  };
}

function buildUpdatePath(resourceType: string): any {
  return {
    tags: [resourceType],
    summary: 'Update ' + resourceType,
    description: 'Update ' + resourceType,
    operationId: 'update' + resourceType,
    security: {
      OAuth2: ['openid']
    },
    parameters: [
      {
        name: 'id',
        in: 'path',
        description: resourceType + ' ID',
        required: true,
        schema: {
          type: 'string',
          format: 'uuid'
        }
      }
    ],
    requestBody: {
      description: 'Update ' + resourceType,
      content: {
        'application/fhir+json': {
          schema: {
            $ref: '#/components/schemas/' + resourceType
          }
        }
      },
      required: true
    },
    responses: {
      '200': {
        description: 'Success',
        content: {
          'application/fhir+json': {
            schema: {
              $ref: '#/components/schemas/' + resourceType
            }
          }
        }
      }
    }
  };
}

function buildDeletePath(resourceType: string): any {
  return {
    tags: [resourceType],
    summary: 'Delete ' + resourceType,
    description: 'Delete ' + resourceType,
    operationId: 'delete' + resourceType,
    security: {
      OAuth2: ['openid']
    },
    parameters: [
      {
        name: 'id',
        in: 'path',
        description: resourceType + ' ID',
        required: true,
        schema: {
          type: 'string',
          format: 'uuid'
        }
      }
    ],
    responses: {
      '204': {
        description: 'Success'
      }
    }
  };
}

function buildPatchPath(resourceType: string): any {
  return {
    tags: [resourceType],
    summary: 'Patch ' + resourceType,
    description: 'Patch ' + resourceType,
    operationId: 'patch' + resourceType,
    security: {
      OAuth2: ['openid']
    },
    parameters: [
      {
        name: 'id',
        in: 'path',
        description: resourceType + ' ID',
        required: true,
        schema: {
          type: 'string',
          format: 'uuid'
        }
      }
    ],
    responses: {
      '204': {
        description: 'Success'
      }
    }
  };
}

function hasEndpoint(definition: any): boolean {
  const props = definition?.properties;
  return props && ('resourceType' in props) && ('id' in props);
}
