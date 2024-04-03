import {
  allOk,
  badRequest,
  DEFAULT_SEARCH_COUNT,
  forbidden,
  getResourceTypes,
  LRUCache,
  normalizeOperationOutcome,
  OperationOutcomeError,
} from '@medplum/core';
import { Reference, Resource, ResourceType } from '@medplum/fhirtypes';
import DataLoader from 'dataloader';
import {
  ASTNode,
  ASTVisitor,
  DocumentNode,
  execute,
  ExecutionResult,
  GraphQLError,
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
  parse,
  specifiedRules,
  validate,
  ValidationContext,
} from 'graphql';
import { FhirRequest, FhirResponse, FhirRouter } from '../fhirrouter';
import { FhirRepository } from '../repo';
import { getGraphQLInputType } from './input-types';
import { buildGraphQLOutputType, getGraphQLOutputType, outputTypeCache } from './output-types';
import {
  buildSearchArgs,
  getDepth,
  GraphQLContext,
  invalidRequest,
  isFieldRequested,
  parseSearchArgs,
  resolveBySearch,
} from './utils';

/**
 * Cache of "introspection" query results.
 * Common case is the standard schema query from GraphiQL and Insomnia.
 * The result is big and somewhat computationally expensive.
 */
const introspectionResults = new LRUCache<ExecutionResult>();

/**
 * Cached GraphQL schema.
 * This should be initialized at server startup.
 */
let rootSchema: GraphQLSchema | undefined;
interface ConnectionResponse {
  count?: number;
  offset?: number;
  pageSize?: number;
  edges?: ConnectionEdge[];
}

interface ConnectionEdge {
  mode?: string;
  score?: number;
  resource?: Resource;
}

/**
 * Handles FHIR GraphQL requests.
 *
 * See: https://www.hl7.org/fhir/graphql.html
 * @param req - The request details.
 * @param repo - The current user FHIR repository.
 * @param router - The router for router options.
 * @returns The response.
 */
export async function graphqlHandler(
  req: FhirRequest,
  repo: FhirRepository,
  router: FhirRouter
): Promise<FhirResponse> {
  const { query, operationName, variables } = req.body;
  if (!query) {
    return [badRequest('Must provide query.')];
  }

  let document: DocumentNode;
  try {
    document = parse(query);
  } catch (err) {
    return [badRequest('GraphQL syntax error.')];
  }

  const schema = getRootSchema();
  const validationRules = [...specifiedRules, MaxDepthRule];
  const validationErrors = validate(schema, document, validationRules);
  if (validationErrors.length > 0) {
    return [invalidRequest(validationErrors)];
  }

  const introspection = isIntrospectionQuery(query);
  if (introspection && !router.options?.introspectionEnabled) {
    return [forbidden];
  }

  const dataLoader = new DataLoader<Reference, Resource>((keys) => repo.readReferences(keys));

  let result: any = introspection && introspectionResults.get(query);
  if (!result) {
    result = await execute({
      schema,
      document,
      contextValue: { repo, dataLoader },
      operationName,
      variableValues: variables,
    });
  }

  return [allOk, result];
}

/**
 * Returns true if the query is a GraphQL introspection query.
 *
 * Introspection queries ask for the schema, which is expensive.
 *
 * See: https://graphql.org/learn/introspection/
 * @param query - The GraphQL query.
 * @returns True if the query is an introspection query.
 */
function isIntrospectionQuery(query: string): boolean {
  return query.includes('query IntrospectionQuery') || query.includes('__schema');
}

export function getRootSchema(): GraphQLSchema {
  if (!rootSchema) {
    rootSchema = buildRootSchema();
  }
  return rootSchema;
}

function buildRootSchema(): GraphQLSchema {
  // First, create placeholder types
  // We need this first for circular dependencies
  for (const resourceType of getResourceTypes()) {
    outputTypeCache[resourceType] = buildGraphQLOutputType(resourceType);
  }

  // Next, fill in all of the type properties
  const fields: GraphQLFieldConfigMap<any, GraphQLContext> = {};
  const mutationFields: GraphQLFieldConfigMap<any, GraphQLContext> = {};

  for (const resourceType of getResourceTypes()) {
    const graphQLOutputType = getGraphQLOutputType(resourceType);

    // Get resource by ID
    fields[resourceType] = {
      type: graphQLOutputType,
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
      type: new GraphQLList(graphQLOutputType),
      args: buildSearchArgs(resourceType),
      resolve: resolveBySearch,
    };

    // FHIR GraphQL Connection API
    fields[resourceType + 'Connection'] = {
      type: buildConnectionType(resourceType, graphQLOutputType),
      args: buildSearchArgs(resourceType),
      resolve: resolveByConnectionApi,
    };

    // Mutation API
    mutationFields[resourceType + 'Create'] = {
      type: graphQLOutputType,
      args: buildCreateArgs(resourceType),
      resolve: resolveByCreate,
    };

    mutationFields[resourceType + 'Update'] = {
      type: graphQLOutputType,
      args: buildUpdateArgs(resourceType),
      resolve: resolveByUpdate,
    };

    mutationFields[resourceType + 'Delete'] = {
      type: graphQLOutputType,
      args: {
        id: {
          type: new GraphQLNonNull(GraphQLID),
          description: resourceType + ' ID',
        },
      },
      resolve: resolveByDelete,
    };
  }

  return new GraphQLSchema({
    query: new GraphQLObjectType({
      name: 'QueryType',
      fields,
    }),
    mutation: new GraphQLObjectType({
      name: 'MutationType',
      fields: mutationFields,
    }),
  });
}

function buildCreateArgs(resourceType: string): GraphQLFieldConfigArgumentMap {
  const args: GraphQLFieldConfigArgumentMap = {
    res: {
      type: new GraphQLNonNull(getGraphQLInputType(resourceType, 'Create')),
      description: resourceType + ' Create',
    },
  };
  return args;
}

function buildUpdateArgs(resourceType: string): GraphQLFieldConfigArgumentMap {
  const args: GraphQLFieldConfigArgumentMap = {
    id: {
      type: new GraphQLNonNull(GraphQLID),
      description: resourceType + ' ID',
    },
    res: {
      type: new GraphQLNonNull(getGraphQLInputType(resourceType, 'Update')),
      description: resourceType + ' Update',
    },
  };
  return args;
}

function buildConnectionType(resourceType: ResourceType, resourceGraphQLType: GraphQLOutputType): GraphQLOutputType {
  return new GraphQLObjectType({
    name: resourceType + 'Connection',
    fields: {
      count: { type: GraphQLInt },
      offset: { type: GraphQLInt },
      pageSize: { type: GraphQLInt },
      first: { type: GraphQLString },
      previous: { type: GraphQLString },
      next: { type: GraphQLString },
      last: { type: GraphQLString },
      edges: {
        type: new GraphQLList(
          new GraphQLObjectType({
            name: resourceType + 'ConnectionEdge',
            fields: {
              mode: { type: GraphQLString },
              score: { type: GraphQLFloat },
              resource: { type: resourceGraphQLType },
            },
          })
        ),
      },
    },
  });
}

/**
 * GraphQL data loader for search requests.
 * The field name should always end with "List" (i.e., "Patient" search uses "PatientList").
 * The search args should be FHIR search parameters.
 * @param source - The source/root.  This should always be null for our top level readers.
 * @param args - The GraphQL search arguments.
 * @param ctx - The GraphQL context.
 * @param info - The GraphQL resolve info.  This includes the schema, and additional field details.
 * @returns Promise to read the resoures for the query.
 */
async function resolveByConnectionApi(
  source: any,
  args: Record<string, string>,
  ctx: GraphQLContext,
  info: GraphQLResolveInfo
): Promise<ConnectionResponse | undefined> {
  const fieldName = info.fieldName;
  const resourceType = fieldName.substring(0, fieldName.length - 'Connection'.length) as ResourceType;
  const searchRequest = parseSearchArgs(resourceType, source, args);
  if (isFieldRequested(info, 'count')) {
    searchRequest.total = 'accurate';
  }
  const bundle = await ctx.repo.search(searchRequest);
  return {
    count: bundle.total,
    offset: searchRequest.offset || 0,
    pageSize: searchRequest.count || DEFAULT_SEARCH_COUNT,
    edges: bundle.entry?.map((e) => ({
      mode: e.search?.mode,
      score: e.search?.score,
      resource: e.resource as Resource,
    })),
  };
}

/**
 * GraphQL data loader for ID requests.
 * The field name should always by the resource type.
 * There should always be exactly one argument "id".
 * @param _source - The source/root.  This should always be null for our top level readers.
 * @param args - The GraphQL search arguments.
 * @param ctx - The GraphQL context.
 * @param info - The GraphQL resolve info.  This includes the schema, and additional field details.
 * @returns Promise to read the resoure for the query.
 */
async function resolveById(
  _source: any,
  args: any,
  ctx: GraphQLContext,
  info: GraphQLResolveInfo
): Promise<Resource | undefined> {
  try {
    return await ctx.dataLoader.load({ reference: `${info.fieldName}/${args.id}` });
  } catch (err) {
    throw new OperationOutcomeError(normalizeOperationOutcome(err), err);
  }
}

/**
 * GraphQL resolver function for create requests.
 * The field name should end with "Create" (i.e., "PatientCreate" for updating a Patient).
 * The args should include the data to be created for the specified resource type.
 * @param _source - The source/root object. In the case of creates, this is typically not used and is thus ignored.
 * @param args - The GraphQL arguments, containing the new data for the resource.
 * @param ctx - The GraphQL context. This includes the repository where resources are stored.
 * @param info - The GraphQL resolve info. This includes the schema, field details, and other query-specific information.
 * @returns A Promise that resolves to the created resource, or undefined if the resource could not be found or updated.
 */
async function resolveByCreate(
  _source: any,
  args: Record<string, any>,
  ctx: GraphQLContext,
  info: GraphQLResolveInfo
): Promise<any> {
  const fieldName = info.fieldName;
  const resourceType = fieldName.substring(0, fieldName.length - 'Create'.length) as ResourceType;
  const resourceArgs = args.res;
  if (resourceArgs.resourceType !== resourceType) {
    throw new OperationOutcomeError(badRequest('Invalid resourceType'));
  }
  return ctx.repo.createResource(resourceArgs as Resource);
}

/**
 * GraphQL resolver function for update requests.
 * The field name should end with "Update" (i.e., "PatientUpdate" for updating a Patient).
 * The args should include the data to be updated for the specified resource type.
 * @param _source - The source/root object. In the case of updates, this is typically not used and is thus ignored.
 * @param args - The GraphQL arguments, containing the new data for the resource.
 * @param ctx - The GraphQL context. This includes the repository where resources are stored.
 * @param info - The GraphQL resolve info. This includes the schema, field details, and other query-specific information.
 * @returns A Promise that resolves to the updated resource, or undefined if the resource could not be found or updated.
 */
async function resolveByUpdate(
  _source: any,
  args: Record<string, any>,
  ctx: GraphQLContext,
  info: GraphQLResolveInfo
): Promise<any> {
  const fieldName = info.fieldName;
  const resourceType = fieldName.substring(0, fieldName.length - 'Update'.length) as ResourceType;
  const resourceArgs = args.res;
  const resourceId = args.id;
  if (resourceArgs.resourceType !== resourceType) {
    throw new OperationOutcomeError(badRequest('Invalid resourceType'));
  }
  if (resourceId !== resourceArgs.id) {
    throw new OperationOutcomeError(badRequest('Invalid ID'));
  }
  return ctx.repo.updateResource(resourceArgs as Resource);
}

/**
 * GraphQL resolver function for delete requests.
 * The field name should end with "Delete" (e.g., "PatientDelete" for deleting a Patient).
 * The args should include the ID of the resource to be deleted.
 * @param _source - The source/root object. In the case of deletions, this is typically not used and is thus ignored.
 * @param args - The GraphQL arguments, containing the ID of the resource to be deleted.
 * @param ctx - The GraphQL context. This includes the repository where resources are stored.
 * @param info - The GraphQL resolve info. This includes the schema, field details, and other query-specific information.
 * @returns A Promise that resolves when the resource has been deleted. No value is returned.
 */
async function resolveByDelete(
  _source: any,
  args: Record<string, string>,
  ctx: GraphQLContext,
  info: GraphQLResolveInfo
): Promise<void> {
  const fieldName = info.fieldName;
  const resourceType = fieldName.substring(0, fieldName.length - 'Delete'.length) as ResourceType;
  await ctx.repo.deleteResource(resourceType, args.id);
}

/**
 * Custom GraphQL rule that enforces max depth constraint.
 * @param context - The validation context.
 * @returns An ASTVisitor that validates the maximum depth rule.
 */
const MaxDepthRule = (context: ValidationContext): ASTVisitor => ({
  Field(
    /** The current node being visiting. */
    node: any,
    /** The index or key to this node from the parent node or Array. */
    _key: string | number | undefined,
    /** The parent immediately above this node, which may be an Array. */
    _parent: ASTNode | readonly ASTNode[] | undefined,
    /** The key path to get to this node from the root node. */
    path: readonly (string | number)[]
  ): any {
    const depth = getDepth(path);
    const maxDepth = 12;
    if (depth > maxDepth) {
      const fieldName = node.name.value;
      context.reportError(
        new GraphQLError(`Field "${fieldName}" exceeds max depth (depth=${depth}, max=${maxDepth})`, {
          nodes: node,
        })
      );
    }
  },
});
