// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { ContentType } from '@medplum/core';
import type { Request, Response } from 'express';
import type { JSONSchema4 } from 'json-schema';
import type {
  ComponentsObject,
  ContentObject,
  OpenAPIObject,
  OperationObject,
  ParameterObject,
  PathsObject,
  ReferenceObject,
  ResponseObject,
  SchemaObject,
  TagObject,
} from 'openapi3-ts/oas31';
import { getConfig } from './config/loader';
import { getJsonSchemaDefinitions } from './fhir/jsonschema';
import { SMART_SCOPES_SUPPORTED } from './fhir/smart';

type OpenAPIObjectWithPaths = OpenAPIObject & { paths: PathsObject };
type SchemaMap = { [schema: string]: SchemaObject | ReferenceObject };

let cachedSpec: OpenAPIObjectWithPaths;

export function openApiHandler(_req: Request, res: Response): void {
  res.status(200).json(getSpec());
}

function getSpec(): OpenAPIObjectWithPaths {
  if (!cachedSpec) {
    cachedSpec = buildSpec();
  }
  return cachedSpec;
}

function buildSpec(): OpenAPIObjectWithPaths {
  const result = buildBaseSpec();
  const definitions = getJsonSchemaDefinitions();
  const resourceTypes: string[] = [];
  for (const [name, definition] of Object.entries(definitions)) {
    buildFhirType(result, name, definition);
    if (isResourceType(definition)) {
      resourceTypes.push(name);
    }
  }
  buildPaths(result, resourceTypes);
  return result;
}

/**
 * Builds the base structure of the OpenAPI specification.
 * See: https://swagger.io/specification/
 * @returns The OpenAPI specification.
 */
function buildBaseSpec(): OpenAPIObjectWithPaths {
  const config = getConfig();
  return {
    openapi: '3.1.0',
    info: {
      title: 'Medplum - OpenAPI 3.0',
      description:
        'Medplum OpenAPI 3.0 specification.  Learn more about Medplum at [https://www.medplum.com](https://www.medplum.com).',
      termsOfService: 'https://www.medplum.com/terms',
      contact: {
        email: 'hello@medplum.com',
      },
      license: {
        name: 'Apache 2.0',
        url: 'https://www.apache.org/licenses/LICENSE-2.0.html',
      },
      version: '1.0.5',
    },
    externalDocs: {
      description: 'Learn more about Medplum',
      url: 'https://www.medplum.com/',
    },
    servers: [
      {
        url: config.baseUrl,
      },
    ],
    // Each entry is an alternative; listing all schemes in one entry would require all of them at once.
    security: [{ BasicAuth: [] }, { BearerAuth: [] }, { OpenID: [] }, { OAuth2: [] }],
    tags: [],
    paths: {},
    components: {
      schemas: {},
      securitySchemes: {
        BasicAuth: {
          type: 'http',
          scheme: 'basic',
        },
        BearerAuth: {
          type: 'http',
          scheme: 'bearer',
          bearerFormat: 'JWT',
        },
        OpenID: {
          type: 'openIdConnect',
          openIdConnectUrl: config.baseUrl + '.well-known/openid-configuration',
        },
        OAuth2: {
          type: 'oauth2',
          description: 'SMART App Launch: https://www.medplum.com/docs/integration/smart-app-launch',
          flows: {
            authorizationCode: {
              authorizationUrl: config.authorizeUrl,
              tokenUrl: config.tokenUrl,
              refreshUrl: config.tokenUrl,
              scopes: buildOAuthScopes(),
            },
            clientCredentials: {
              tokenUrl: config.tokenUrl,
              refreshUrl: config.tokenUrl,
              scopes: buildOAuthScopes(),
            },
          },
        },
      },
    },
  };
}

function buildOAuthScopes(): Record<string, string> {
  return Object.fromEntries(SMART_SCOPES_SUPPORTED.map((scope) => [scope, scope]));
}

/**
 * Builds the OpenAPI specification details for a FHIR type.
 * @param result - The OpenAPI specification output.
 * @param typeName - The FHIR type name.
 * @param typeDefinition - The FHIR type definition.
 */
function buildFhirType(result: OpenAPIObject, typeName: string, typeDefinition: JSONSchema4): void {
  buildSchema(result, typeName, typeDefinition);
  if (isResourceType(typeDefinition)) {
    buildTags(result, typeName, typeDefinition);
  }
}

/**
 * Builds the schema for a FHIR type.
 * See: https://swagger.io/specification/#schema-object
 * @param result - The OpenAPI specification output.
 * @param typeName - The FHIR type name.
 * @param typeDefinition - The FHIR type definition.
 */
function buildSchema(result: OpenAPIObject, typeName: string, typeDefinition: JSONSchema4): void {
  ((result.components as ComponentsObject).schemas as SchemaMap)[typeName] = buildObjectSchema(typeDefinition);
}

/**
 * Converts a JSONSchema type definition to an OpenAPI type definition.
 * @param definition - The JSONSchema type definition.
 * @returns The OpenAPI type definition.
 */
function buildObjectSchema(definition: JSONSchema4): SchemaObject {
  const result = JSON.parse(JSON.stringify(definition, refReplacer)) as SchemaObject;
  const resourceTypeProperty = result.properties?.resourceType as any;
  if (resourceTypeProperty?.const) {
    delete resourceTypeProperty.const;
    resourceTypeProperty.type = 'string';
  }
  return result;
}

/**
 * Replaces JSONSchema references with OpenAPI references.
 * Can be used as 2nd parameter in JSON.stringify.
 * @param key - The JSON property key.
 * @param value - The JSON property value.
 * @returns The updated JSON property value.
 */
function refReplacer(key: string, value: any): any {
  if (key === '$ref') {
    return (value as string).replace('#/definitions/', '#/components/schemas/');
  }
  if (key.startsWith('_')) {
    return undefined;
  }
  return value;
}

/**
 * Builds the tags for a FHIR type.
 * See: https://swagger.io/specification/#tag-object
 * @param result - The OpenAPI specification output.
 * @param typeName - The FHIR type name.
 * @param typeDefinition - The FHIR type definition.
 */
function buildTags(result: OpenAPIObject, typeName: string, typeDefinition: JSONSchema4): void {
  (result.tags as TagObject[]).push({
    name: typeName,
    description: typeDefinition.description,
    externalDocs: {
      url: 'https://www.medplum.com/docs/api/fhir/resources/' + typeName.toLowerCase(),
    },
  });
}

/**
 * Builds the paths for the FHIR REST interactions.
 * Paths are generic over resource type, so resource bodies reference the ResourceList schema.
 * See: https://hl7.org/fhir/R4/http.html
 * @param result - The OpenAPI specification output.
 * @param resourceTypes - The FHIR resource type names.
 */
function buildPaths(result: OpenAPIObjectWithPaths, resourceTypes: string[]): void {
  (result.components as ComponentsObject).parameters = buildParameters(resourceTypes);

  result.paths[`/fhir/R4`] = {
    post: buildBatchPath(),
  };

  result.paths[`/fhir/R4/{resourceType}`] = {
    get: buildSearchPath(),
    post: buildCreatePath(),
    put: buildConditionalUpdatePath(),
  };

  result.paths[`/fhir/R4/{resourceType}/$validate`] = {
    post: buildValidatePath(),
  };

  result.paths[`/fhir/R4/{resourceType}/{id}`] = {
    get: buildReadPath(),
    put: buildUpdatePath(),
    delete: buildDeletePath(),
    patch: buildPatchPath(),
  };

  result.paths[`/fhir/R4/{resourceType}/{id}/_history`] = {
    get: buildReadHistoryPath(),
  };

  result.paths[`/fhir/R4/{resourceType}/{id}/_history/{versionId}`] = {
    get: buildReadVersionPath(),
  };
}

function buildParameters(resourceTypes: string[]): Record<string, ParameterObject> {
  return {
    resourceType: {
      name: 'resourceType',
      in: 'path',
      description: 'Resource Type',
      required: true,
      schema: { type: 'string', enum: resourceTypes },
    },
    id: {
      name: 'id',
      in: 'path',
      description: 'Resource ID',
      required: true,
      schema: { type: 'string', format: 'uuid' },
    },
    versionId: {
      name: 'versionId',
      in: 'path',
      description: 'Version ID',
      required: true,
      schema: { type: 'string', format: 'uuid' },
    },
    criteria: {
      name: 'criteria',
      in: 'query',
      description: 'FHIR search parameters, such as identifier=http://example.com|123',
      required: false,
      style: 'form',
      explode: true,
      schema: { type: 'object', additionalProperties: { type: 'string' } },
    },
    ifMatch: {
      name: 'If-Match',
      in: 'header',
      description: 'Only write if the current version matches, such as W/"<versionId>"',
      required: false,
      schema: { type: 'string' },
    },
  };
}

function parameterRef(name: string): ReferenceObject {
  return { $ref: `#/components/parameters/${name}` };
}

function fhirContent(schemaName: string): ContentObject {
  return { [ContentType.FHIR_JSON]: { schema: { $ref: `#/components/schemas/${schemaName}` } } };
}

function fhirResponse(description: string, schemaName: string): ResponseObject {
  return { description, content: fhirContent(schemaName) };
}

function buildBatchPath(): OperationObject {
  return {
    summary: 'Batch or Transaction',
    description: 'Executes a batch or transaction Bundle',
    operationId: 'batch',
    requestBody: {
      description: 'Bundle of type batch or transaction',
      content: fhirContent('Bundle'),
      required: true,
    },
    responses: {
      '200': fhirResponse('Bundle of type batch-response or transaction-response', 'Bundle'),
      '400': fhirResponse('Invalid Bundle', 'OperationOutcome'),
    },
  };
}

function buildSearchPath(): OperationObject {
  return {
    summary: 'Search',
    description: 'Search',
    operationId: 'search',
    parameters: [parameterRef('resourceType'), parameterRef('criteria')],
    responses: {
      '200': fhirResponse('Success', 'Bundle'),
    },
  };
}

function buildCreatePath(): OperationObject {
  return {
    summary: 'Create Resource',
    description:
      'Create Resource. With If-None-Exist, this is a conditional create: the resource is only created if no existing resource matches the criteria.',
    operationId: 'createResource',
    parameters: [
      parameterRef('resourceType'),
      {
        name: 'If-None-Exist',
        in: 'header',
        description: 'FHIR search query, such as identifier=http://example.com|123',
        required: false,
        schema: { type: 'string' },
      },
    ],
    requestBody: {
      description: 'Create Resource',
      content: fhirContent('ResourceList'),
      required: true,
    },
    responses: {
      '200': fhirResponse('If-None-Exist matched one resource; it is returned and nothing is created', 'ResourceList'),
      '201': fhirResponse('Created', 'ResourceList'),
      '400': fhirResponse('Invalid resource', 'OperationOutcome'),
      '412': fhirResponse('If-None-Exist matched multiple resources; nothing is created', 'OperationOutcome'),
    },
  };
}

function buildConditionalUpdatePath(): OperationObject {
  return {
    summary: 'Conditional Update',
    description:
      'Update the resource that matches the search criteria, or create it if there is no match. Also known as upsert.',
    operationId: 'conditionalUpdate',
    parameters: [parameterRef('resourceType'), parameterRef('criteria'), parameterRef('ifMatch')],
    requestBody: {
      description: 'Resource to update or create',
      content: fhirContent('ResourceList'),
      required: true,
    },
    responses: {
      '200': fhirResponse('Matched one resource, which was updated', 'ResourceList'),
      '201': fhirResponse('Matched no resources, so the resource was created', 'ResourceList'),
      '400': fhirResponse('Invalid resource, or resource ID does not match the matched resource', 'OperationOutcome'),
      '412': fhirResponse('Matched multiple resources, or If-Match failed; nothing is written', 'OperationOutcome'),
    },
  };
}

function buildValidatePath(): OperationObject {
  return {
    summary: 'Validate Resource',
    description: 'Validate a resource without saving it',
    operationId: 'validateResource',
    parameters: [parameterRef('resourceType')],
    requestBody: {
      description: 'Resource to validate',
      content: fhirContent('ResourceList'),
      required: true,
    },
    responses: {
      '200': fhirResponse('Valid', 'OperationOutcome'),
      '400': fhirResponse('Invalid', 'OperationOutcome'),
    },
  };
}

function buildReadPath(): OperationObject {
  return {
    summary: 'Read Resource',
    description: 'Read Resource',
    operationId: 'readResource',
    parameters: [parameterRef('resourceType'), parameterRef('id')],
    responses: {
      '200': fhirResponse('Success', 'ResourceList'),
    },
  };
}

function buildReadHistoryPath(): OperationObject {
  return {
    summary: 'Read Resource History',
    description: 'Read Resource History',
    operationId: 'readResourceHistory',
    parameters: [parameterRef('resourceType'), parameterRef('id')],
    responses: {
      '200': fhirResponse('Success', 'Bundle'),
    },
  };
}

function buildReadVersionPath(): OperationObject {
  return {
    summary: 'Read Version',
    description: 'Read Version',
    operationId: 'readVersion',
    parameters: [parameterRef('resourceType'), parameterRef('id'), parameterRef('versionId')],
    responses: {
      '200': fhirResponse('Success', 'ResourceList'),
    },
  };
}

function buildUpdatePath(): OperationObject {
  return {
    summary: 'Update Resource',
    description: 'Update Resource',
    operationId: 'updateResource',
    parameters: [parameterRef('resourceType'), parameterRef('id'), parameterRef('ifMatch')],
    requestBody: {
      description: 'Update Resource',
      content: fhirContent('ResourceList'),
      required: true,
    },
    responses: {
      '200': fhirResponse('Success', 'ResourceList'),
      '400': fhirResponse('Invalid resource', 'OperationOutcome'),
      '412': fhirResponse('If-Match failed; nothing is written', 'OperationOutcome'),
    },
  };
}

function buildDeletePath(): OperationObject {
  return {
    summary: 'Delete Resource',
    description: 'Delete Resource',
    operationId: 'deleteResource',
    parameters: [parameterRef('resourceType'), parameterRef('id')],
    responses: {
      '200': fhirResponse('Success', 'OperationOutcome'),
    },
  };
}

function buildPatchPath(): OperationObject {
  return {
    summary: 'Patch Resource',
    description: 'Patch Resource',
    operationId: 'patchResource',
    parameters: [parameterRef('resourceType'), parameterRef('id'), parameterRef('ifMatch')],
    requestBody: {
      description: 'JSON Patch operations',
      content: {
        [ContentType.JSON_PATCH]: {
          schema: {
            type: 'array',
            items: {
              type: 'object',
              required: ['op', 'path'],
              properties: {
                op: { type: 'string', enum: ['add', 'remove', 'replace', 'move', 'copy', 'test'] },
                path: { type: 'string' },
                from: { type: 'string' },
                value: {},
              },
            },
          },
        },
      },
      required: true,
    },
    responses: {
      '200': fhirResponse('Success', 'ResourceList'),
      '400': fhirResponse('Invalid patch', 'OperationOutcome'),
      '412': fhirResponse('If-Match failed; nothing is written', 'OperationOutcome'),
    },
  };
}

function isResourceType(definition: JSONSchema4): boolean {
  return typeof definition.properties?.resourceType?.const === 'string';
}
