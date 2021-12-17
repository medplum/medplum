import { assertOk, Filter, Operator } from '@medplum/core';
import { Reference, Resource } from '@medplum/fhirtypes';
import {
  GraphQLBoolean,
  GraphQLFieldConfig,
  GraphQLFieldConfigArgumentMap,
  GraphQLFieldConfigMap,
  GraphQLFloat,
  GraphQLID,
  GraphQLList,
  GraphQLNonNull,
  GraphQLObjectType,
  GraphQLOutputType,
  GraphQLResolveInfo,
  GraphQLSchema,
  GraphQLString,
  GraphQLUnionType
} from 'graphql';
import { JSONSchema4 } from 'json-schema';
import { Repository } from './repo';
import { getResourceTypes, getSchemaDefinition } from './schema';
import { getSearchParameters } from './search';

const typeCache: Record<string, GraphQLOutputType> = {
  'base64Binary': GraphQLString,
  'boolean': GraphQLBoolean,
  'canonical': GraphQLString,
  'code': GraphQLString,
  'date': GraphQLString,
  'dateTime': GraphQLString,
  'decimal': GraphQLFloat,
  'id': GraphQLID,
  'instant': GraphQLString,
  'integer': GraphQLFloat,
  'markdown': GraphQLString,
  'number': GraphQLFloat,
  'positiveInt': GraphQLFloat,
  'string': GraphQLString,
  'time': GraphQLString,
  'unsignedInt': GraphQLFloat,
  'uri': GraphQLString,
  'url': GraphQLString,
  'xhtml': GraphQLString,
};

let rootSchema: GraphQLSchema | undefined;

export function getRootSchema(): GraphQLSchema {
  if (!rootSchema) {
    rootSchema = buildRootSchema();
  }
  return rootSchema;
}

function buildRootSchema(): GraphQLSchema {
  const fields: GraphQLFieldConfigMap<any, any> = {};
  for (const resourceType of getResourceTypes()) {
    const graphQLType = getGraphQLType(resourceType);
    if (!graphQLType) {
      continue;
    }

    // Get resource by ID
    fields[resourceType] = {
      type: graphQLType,
      args: {
        id: {
          type: new GraphQLNonNull(GraphQLID),
          description: resourceType + ' ID'
        }
      },
      resolve: resolveById
    };

    // Search resource by search parameters
    const args: GraphQLFieldConfigArgumentMap = {};
    const searchParams = getSearchParameters(resourceType);
    if (searchParams) {
      for (const [name, searchParam] of Object.entries(searchParams)) {
        args[name.replaceAll('-', '_')] = {
          type: GraphQLString,
          description: searchParam.description
        };
      }
    }
    fields[resourceType + 'List'] = {
      type: new GraphQLList(graphQLType),
      args,
      resolve: resolveBySearch
    };
  }

  return new GraphQLSchema({
    query: new GraphQLObjectType({
      name: 'QueryType',
      fields
    })
  });
}

function getGraphQLType(resourceType: string): GraphQLOutputType | undefined {
  if (resourceType === 'Extension' ||
    resourceType === 'ExampleScenario' ||
    resourceType === 'GraphDefinition' ||
    resourceType === 'QuestionnaireResponse') {
    return undefined;
  }

  let result: GraphQLOutputType | undefined = typeCache[resourceType];
  if (!result) {
    result = buildGraphQLType(resourceType);
    if (result) {
      typeCache[resourceType] = result;
    }
  }

  return result;
}

function buildGraphQLType(resourceType: string): GraphQLOutputType | undefined {
  if (resourceType === 'ResourceList') {
    return new GraphQLUnionType({
      name: 'ResourceList',
      types: () => getResourceTypes().map(getGraphQLType).filter(t => !!t) as GraphQLObjectType[],
      resolveType: resolveTypeByReference
    });
  }

  const schema = getSchemaDefinition(resourceType);
  const properties = schema.properties as { [k: string]: JSONSchema4 };
  const fields: GraphQLFieldConfigMap<any, any> = {};

  for (const [propertyName, property] of Object.entries(properties)) {
    if (propertyName.startsWith('_') ||
      propertyName === 'contained' ||
      propertyName === 'extension' ||
      propertyName === 'modifierExtension' ||
      (resourceType === 'Reference' && propertyName === 'identifier') ||
      (resourceType === 'Bundle_Response' && propertyName === 'outcome')) {
      continue;
    }

    const propertyType = getPropertyType(resourceType, property);
    if (!propertyType) {
      continue;
    }

    const fieldConfig: GraphQLFieldConfig<any, any> = {
      type: propertyType,
      description: (property as any).description
    };

    if (resourceType === 'Reference' && propertyName === 'resource') {
      fieldConfig.resolve = resolveByReference;
    }

    fields[propertyName] = fieldConfig;
  }

  return new GraphQLObjectType({
    name: resourceType,
    description: schema.description,
    fields
  });
}

function getPropertyType(parentType: string, property: any): GraphQLOutputType | undefined {
  const refStr = getRefString(property);
  if (refStr) {
    if (refStr === parentType) {
      // TODO: Self reference
      return undefined;
    }
    return getGraphQLType(refStr);
  }

  const typeStr = property.type;
  if (typeStr) {
    if (typeStr === 'array') {
      const itemType = getPropertyType(parentType, property.items);
      if (!itemType) {
        return undefined;
      }
      return new GraphQLList(itemType);
    }
    return getGraphQLType(typeStr);
  }

  if (property.enum || property.const) {
    return GraphQLString;
  }

  return undefined;
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
async function resolveBySearch(source: any, args: any, ctx: any, info: GraphQLResolveInfo): Promise<Resource[] | undefined> {
  const fieldName = info.fieldName;
  const resourceType = fieldName.substr(0, fieldName.length - 4);
  const repo = ctx.res.locals.repo as Repository;
  const [outcome, bundle] = await repo.search({
    resourceType,
    filters: Object.entries(args).map(e => ({
      code: e[0],
      operator: Operator.EQUALS,
      value: e[1] as string
    } as Filter))
  });
  assertOk(outcome);
  return bundle?.entry?.map(e => e.resource as Resource);
}

/**
 * GraphQL data loader for ID requests.
 * The field name should always by the resource type.
 * There should always be exactly one argument "id".
 * @param source The source/root.  This should always be null for our top level readers.
 * @param args The GraphQL search arguments.
 * @param ctx The GraphQL context.  This is the Node IncomingMessage.
 * @param info The GraphQL resolve info.  This includes the schema, and additional field details.
 * @returns Promise to read the resoure for the query.
 * @implements {GraphQLFieldResolver}
 */
async function resolveById(source: any, args: any, ctx: any, info: GraphQLResolveInfo): Promise<Resource | undefined> {
  const repo = ctx.res.locals.repo as Repository;
  const [outcome, resource] = await repo.readResource(info.fieldName, args.id);
  assertOk(outcome);
  return resource;
}

/**
 * GraphQL data loader for Reference requests.
 * This is a special data loader for following Reference objects.
 * @param source The source/root.  This should always be null for our top level readers.
 * @param args The GraphQL search arguments.
 * @param ctx The GraphQL context.  This is the Node IncomingMessage.
 * @param info The GraphQL resolve info.  This includes the schema, and additional field details.
 * @returns Promise to read the resoure(s) for the query.
 * @implements {GraphQLFieldResolver}
 */
async function resolveByReference(source: any, args: any, ctx: any): Promise<Resource | undefined> {
  const repo = ctx.res.locals.repo as Repository;
  const [outcome, resource] = await repo.readReference(source as Reference);
  assertOk(outcome);
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

  const graphQLType = getGraphQLType(resourceType);
  if (!graphQLType) {
    return undefined;
  }

  return (graphQLType as GraphQLObjectType).name;
}
