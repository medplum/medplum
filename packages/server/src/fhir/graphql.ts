import { assertOk, badRequest, Filter, getReferenceString, Operator, SearchRequest } from '@medplum/core';
import { Reference, Resource } from '@medplum/fhirtypes';
import { Request, Response } from 'express';
import {
  DocumentNode,
  execute,
  GraphQLBoolean,
  GraphQLEnumType,
  GraphQLEnumValueConfigMap,
  GraphQLFieldConfig,
  GraphQLFieldConfigArgumentMap,
  GraphQLFieldConfigMap,
  GraphQLFloat,
  GraphQLID,
  GraphQLInt,
  GraphQLList,
  GraphQLNonNull,
  GraphQLObjectType,
  GraphQLOutputType,
  GraphQLResolveInfo,
  GraphQLSchema,
  GraphQLString,
  GraphQLUnionType,
  parse,
  validate,
} from 'graphql';
import { JSONSchema4 } from 'json-schema';
import { asyncWrap } from '../async';
import { sendOutcome } from './outcomes';
import { Repository } from './repo';
import { rewriteAttachments, RewriteMode } from './rewrite';
import { getResourceTypes, getSchemaDefinition } from './schema';
import { parseSearchRequest } from './search';
import { getSearchParameters } from './structure';

const typeCache: Record<string, GraphQLOutputType | undefined> = {
  base64Binary: GraphQLString,
  boolean: GraphQLBoolean,
  canonical: GraphQLString,
  code: GraphQLString,
  date: GraphQLString,
  dateTime: GraphQLString,
  decimal: GraphQLFloat,
  id: GraphQLID,
  instant: GraphQLString,
  integer: GraphQLFloat,
  markdown: GraphQLString,
  number: GraphQLFloat,
  positiveInt: GraphQLFloat,
  string: GraphQLString,
  time: GraphQLString,
  unsignedInt: GraphQLFloat,
  uri: GraphQLString,
  url: GraphQLString,
  xhtml: GraphQLString,
};

let rootSchema: GraphQLSchema | undefined;

/**
 * Handles FHIR GraphQL requests.
 *
 * See: https://www.hl7.org/fhir/graphql.html
 */
export const graphqlHandler = asyncWrap(async (req: Request, res: Response) => {
  const query = req.body.query;
  if (!query) {
    sendOutcome(res, badRequest('Must provide query.'));
    return;
  }

  let document: DocumentNode;
  try {
    document = parse(query);
  } catch (err) {
    sendOutcome(res, badRequest('GraphQL syntax error.'));
    return;
  }

  const schema = getRootSchema();
  const validationErrors = validate(schema, document);
  if (validationErrors.length > 0) {
    sendOutcome(res, badRequest('GraphQL validation error.'));
    return;
  }

  try {
    const result = await execute({
      schema,
      document,
      contextValue: { res },
    });
    const status = result.data ? 200 : 400;
    const repo = res.locals.repo as Repository;
    res.status(status).json(await rewriteAttachments(RewriteMode.PRESIGNED_URL, repo, result));
  } catch (err) {
    console.log('graphql err', err);
    res.sendStatus(500);
  }
});

function getRootSchema(): GraphQLSchema {
  if (!rootSchema) {
    rootSchema = buildRootSchema();
  }
  return rootSchema;
}

function buildRootSchema(): GraphQLSchema {
  // First, create placeholder types
  // We need this first for circular dependencies
  for (const resourceType of getResourceTypes()) {
    const graphQLType = buildGraphQLType(resourceType);
    if (graphQLType) {
      typeCache[resourceType] = graphQLType;
    }
  }

  // Next, fill in all of the type properties
  const fields: GraphQLFieldConfigMap<any, any> = {};
  for (const resourceType of getResourceTypes()) {
    const graphQLType = getGraphQLType(resourceType);

    // Get resource by ID
    fields[resourceType] = {
      type: graphQLType,
      args: {
        id: {
          type: new GraphQLNonNull(GraphQLID),
          description: resourceType + ' ID',
        },
      },
      resolve: resolveById,
    };

    // Search resource by search parameters
    fields[resourceType + 'List'] = {
      type: new GraphQLList(graphQLType),
      args: buildSearchArgs(resourceType),
      resolve: resolveBySearch,
    };
  }

  return new GraphQLSchema({
    query: new GraphQLObjectType({
      name: 'QueryType',
      fields,
    }),
  });
}

function getGraphQLType(resourceType: string): GraphQLOutputType {
  let result = typeCache[resourceType];
  if (!result) {
    result = buildGraphQLType(resourceType);
    if (result) {
      typeCache[resourceType] = result;
    }
  }

  return result;
}

function buildGraphQLType(resourceType: string): GraphQLOutputType {
  if (resourceType === 'ResourceList') {
    return new GraphQLUnionType({
      name: 'ResourceList',
      types: () =>
        getResourceTypes()
          .map(getGraphQLType)
          .filter((t) => !!t) as GraphQLObjectType[],
      resolveType: resolveTypeByReference,
    });
  }

  const schema = getSchemaDefinition(resourceType);
  return new GraphQLObjectType({
    name: resourceType,
    description: schema.description,
    fields: () => buildGraphQLFields(resourceType),
  });
}

function buildGraphQLFields(resourceType: string): GraphQLFieldConfigMap<any, any> {
  const fields: GraphQLFieldConfigMap<any, any> = {};
  buildPropertyFields(resourceType, fields);
  buildReverseLookupFields(resourceType, fields);
  return fields;
}

function buildPropertyFields(resourceType: string, fields: GraphQLFieldConfigMap<any, any>): void {
  const schema = getSchemaDefinition(resourceType);
  const properties = schema.properties as { [k: string]: JSONSchema4 };

  for (const [propertyName, property] of Object.entries(properties)) {
    const propertyType = getPropertyType(resourceType, property);
    const fieldConfig: GraphQLFieldConfig<any, any> = {
      type: propertyType,
      description: property.description,
    };

    if (resourceType === 'Reference' && propertyName === 'resource') {
      fieldConfig.resolve = resolveByReference;
    }

    fields[propertyName] = fieldConfig;
  }
}

/**
 * Builds a list of reverse lookup fields for a resource type.
 *
 * It's also possible to use search is a special mode, doing reverse lookups -
 * e.g. list all the resources that refer to this resource.
 *
 * An example of this use is to look up a patient,
 * and also retrieve all the Condition resources for the patient.
 *
 * This is a special case of search, above, but with an additional mandatory parameter _reference. For example:
 *
 * {
 *   name { [some fields] }
 *   ConditionList(_reference: patient) {
 *     [some fields from Condition]
 *   }
 * }
 *
 * There must be at least the argument "_reference" which identifies which of the search parameters
 * for the target resource is used to match the resource that has focus.
 * In addition, there may be other arguments as defined above in search
 * (except that the "id" argument is prohibited here as nonsensical).
 *
 * See: https://www.hl7.org/fhir/graphql.html#reverse
 *
 * @param resourceType The resource type to build fields for.
 * @param fields The fields object to add fields to.
 */
function buildReverseLookupFields(resourceType: string, fields: GraphQLFieldConfigMap<any, any>): void {
  for (const childResourceType of getResourceTypes()) {
    const childGraphQLType = getGraphQLType(childResourceType);
    const childSearchParams = getSearchParameters(childResourceType);
    const enumValues: GraphQLEnumValueConfigMap = {};
    let count = 0;
    if (childSearchParams) {
      for (const [code, searchParam] of Object.entries(childSearchParams)) {
        if (searchParam.target && searchParam.target.includes(resourceType)) {
          enumValues[fhirParamToGraphQLField(code)] = { value: code };
          count++;
        }
      }
    }

    if (count > 0) {
      const enumType = new GraphQLEnumType({
        name: resourceType + '_' + childResourceType + '_reference',
        values: enumValues,
      });
      const args = buildSearchArgs(childResourceType);
      args['_reference'] = {
        type: new GraphQLNonNull(enumType),
        description: `Specify which property to use for reverse lookup for ${childResourceType}`,
      };
      fields[childResourceType + 'List'] = {
        type: new GraphQLList(childGraphQLType),
        args,
        resolve: resolveBySearch,
      };
    }
  }
}

function buildSearchArgs(resourceType: string): GraphQLFieldConfigArgumentMap {
  const args: GraphQLFieldConfigArgumentMap = {
    _count: {
      type: GraphQLInt,
      description: 'Specify how many elements to return from a repeating list.',
    },
    _offset: {
      type: GraphQLInt,
      description: 'Specify the offset to start at for a repeating element.',
    },
    _sort: {
      type: GraphQLString,
      description: 'Specify the sort order by comma-separated list of sort rules in priority order.',
    },
    _id: {
      type: GraphQLString,
      description: 'Select resources based on the logical id of the resource.',
    },
    _lastUpdated: {
      type: GraphQLString,
      description: 'Select resources based on the last time they were changed.',
    },
  };
  const searchParams = getSearchParameters(resourceType);
  if (searchParams) {
    for (const [code, searchParam] of Object.entries(searchParams)) {
      // GraphQL does not support dashes in argument names
      // So convert dashes to underscores
      args[fhirParamToGraphQLField(code)] = {
        type: GraphQLString,
        description: searchParam.description,
      };
    }
  }
  return args;
}

function getPropertyType(parentType: string, property: JSONSchema4): GraphQLOutputType {
  const refStr = getRefString(property);
  if (refStr) {
    return getGraphQLType(refStr);
  }

  const typeStr = property.type;
  if (typeStr) {
    if (typeStr === 'array') {
      return new GraphQLList(getPropertyType(parentType, property.items as JSONSchema4));
    }
    return getGraphQLType(typeStr as string);
  }

  return GraphQLString;
}

function getRefString(property: any): string | undefined {
  if (!('$ref' in property)) {
    return undefined;
  }
  return property.$ref.replace('#/definitions/', '');
}

/**
 * GraphQL data loader for search requests.
 * The field name should always end with "List" (i.e., "Patient" search uses "PatientList").
 * The search args should be FHIR search parameters.
 * @param source The source/root.  This should always be null for our top level readers.
 * @param args The GraphQL search arguments.
 * @param ctx The GraphQL context.  This is the Node IncomingMessage.
 * @param info The GraphQL resolve info.  This includes the schema, and additional field details.
 * @returns Promise to read the resoures for the query.
 * @implements {GraphQLFieldResolver}
 */
async function resolveBySearch(
  source: any,
  args: Record<string, string>,
  ctx: any,
  info: GraphQLResolveInfo
): Promise<Resource[] | undefined> {
  const fieldName = info.fieldName;
  const resourceType = fieldName.substring(0, fieldName.length - 4); // Remove "List"
  const repo = ctx.res.locals.repo as Repository;
  const searchRequest = parseSearchArgs(resourceType, source, args);
  const [outcome, bundle] = await repo.search(searchRequest);
  assertOk(outcome, bundle);
  return bundle.entry?.map((e) => e.resource as Resource);
}

/**
 * GraphQL data loader for ID requests.
 * The field name should always by the resource type.
 * There should always be exactly one argument "id".
 * @param _source The source/root.  This should always be null for our top level readers.
 * @param args The GraphQL search arguments.
 * @param ctx The GraphQL context.  This is the Node IncomingMessage.
 * @param info The GraphQL resolve info.  This includes the schema, and additional field details.
 * @returns Promise to read the resoure for the query.
 * @implements {GraphQLFieldResolver}
 */
async function resolveById(_source: any, args: any, ctx: any, info: GraphQLResolveInfo): Promise<Resource | undefined> {
  const repo = ctx.res.locals.repo as Repository;
  const [outcome, resource] = await repo.readResource(info.fieldName, args.id);
  assertOk(outcome, resource);
  return resource;
}

/**
 * GraphQL data loader for Reference requests.
 * This is a special data loader for following Reference objects.
 * @param source The source/root.  This should always be null for our top level readers.
 * @param _args The GraphQL search arguments.
 * @param ctx The GraphQL context.  This is the Node IncomingMessage.
 * @returns Promise to read the resoure(s) for the query.
 * @implements {GraphQLFieldResolver}
 */
async function resolveByReference(source: any, _args: any, ctx: any): Promise<Resource | undefined> {
  const repo = ctx.res.locals.repo as Repository;
  const [outcome, resource] = await repo.readReference(source as Reference);
  assertOk(outcome, resource);
  return resource;
}

/**
 * GraphQL type resolver for resources.
 * When loading a resource via reference, GraphQL needs to know the type of the resource.
 * @param resource The loaded resource.
 * @returns The GraphQL type of the resource.
 * @implements {GraphQLTypeResolver}
 */
function resolveTypeByReference(resource: Resource | undefined): string | undefined {
  const resourceType = resource?.resourceType;
  if (!resourceType) {
    return undefined;
  }

  return (getGraphQLType(resourceType) as GraphQLObjectType).name;
}

function parseSearchArgs(resourceType: string, source: any, args: Record<string, string>): SearchRequest {
  let referenceFilter: Filter | undefined = undefined;
  if (source) {
    // _reference is a required field for reverse lookup searches
    // The GraphQL parser will validate that it is there.
    const reference = args['_reference'];
    delete args['_reference'];
    referenceFilter = {
      code: reference,
      operator: Operator.EQUALS,
      value: getReferenceString(source as Resource),
    };
  }

  // Reverse the transform of dashes to underscores, back to dashes
  args = Object.fromEntries(Object.entries(args).map(([key, value]) => [graphQLFieldToFhirParam(key), value]));

  // Parse the search request
  const searchRequest = parseSearchRequest(resourceType, args);

  // If a reverse lookup filter was specified,
  // add it to the search request.
  if (referenceFilter) {
    const existingFilters = searchRequest.filters || [];
    searchRequest.filters = [referenceFilter, ...existingFilters];
  }

  return searchRequest;
}

function fhirParamToGraphQLField(code: string): string {
  return code.replaceAll('-', '_');
}

function graphQLFieldToFhirParam(code: string): string {
  return code.startsWith('_') ? code : code.replaceAll('_', '-');
}
