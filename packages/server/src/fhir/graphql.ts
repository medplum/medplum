import { Filter, Operator, Resource } from '@medplum/core';
import {
  GraphQLBoolean,
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
  GraphQLString
} from 'graphql';
import { repo } from './repo';
import { definitions, resourceTypes } from './schema';
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

  for (const resourceType of resourceTypes) {
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
      resolve: dataLoader
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
      resolve: dataLoader
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
    resourceType === 'QuestionnaireResponse' ||
    resourceType === 'ResourceList') {
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
  const schema = definitions[resourceType];
  if (!schema) {
    return undefined;
  }

  const properties = schema.properties;
  if (!properties) {
    return undefined;
  }

  const fields: GraphQLFieldConfigMap<any, any> = {};

  for (const [propertyName, property] of Object.entries(properties)) {
    if (propertyName.startsWith('_') ||
      propertyName === 'contained' ||
      propertyName === 'extension' ||
      propertyName === 'modifierExtension' ||
      propertyName === 'resource' ||
      (resourceType === 'Reference' && propertyName === 'identifier') ||
      (resourceType === 'Bundle_Response' && propertyName === 'outcome')) {
      continue;
    }

    const propertyType = getPropertyType(resourceType, property);
    if (!propertyType) {
      continue;
    }

    fields[propertyName] = {
      type: propertyType,
      description: (property as any).description
    };
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
 * GraphQL data loader.
 * @param source The source/root.  This should always be null for our top level readers.
 * @param args The GraphQL search arguments.
 * @param ctx The GraphQL context.  This is the Node IncomingMessage.
 * @param info The GraphQL resolve info.  This includes the schema, and additional field details.
 * @returns Promise to read the resoure(s) for the query.
 */
async function dataLoader(source: any, args: any, ctx: any, info: GraphQLResolveInfo): Promise<Resource[] | Resource | undefined> {
  const fieldName = info.fieldName;

  // Search by search parameters
  if (fieldName.endsWith('List')) {
    const resourceType = fieldName.substr(0, fieldName.length - 4);
    const [searchOutcome, searchResult] = await repo.search({
      resourceType,
      filters: Object.entries(args).map(e => ({
        code: e[0],
        operator: Operator.EQUALS,
        value: e[1] as string
      } as Filter))
    });
    if (searchOutcome.id !== 'allok') {
      throw new Error(searchOutcome.issue?.[0].details?.text);
    }
    return searchResult?.entry?.map(e => e.resource as Resource);
  }

  // Direct read by ID
  if (args.id) {
    const [readOutcome, readResult] = await repo.readResource(fieldName, args.id);
    if (readOutcome.id !== 'allok') {
      throw new Error(readOutcome.issue?.[0].details?.text);
    }
    return readResult;
  }

  // Unknown search
  return undefined;
}
