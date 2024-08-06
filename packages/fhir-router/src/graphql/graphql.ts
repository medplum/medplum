import {
  allOk,
  badRequest,
  DEFAULT_SEARCH_COUNT,
  forbidden,
  getResourceTypes,
  Logger,
  LRUCache,
  normalizeOperationOutcome,
  OperationOutcomeError,
} from '@medplum/core';
import { Reference, Resource, ResourceType } from '@medplum/fhirtypes';
import DataLoader from 'dataloader';
import {
  ArgumentNode,
  ASTNode,
  ASTVisitor,
  DocumentNode,
  execute,
  ExecutionResult,
  FieldNode,
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
  Kind,
  OperationDefinitionNode,
  parse,
  specifiedRules,
  validate,
  ValidationContext,
} from 'graphql';
import { FhirRequest, FhirResponse, FhirRouter } from '../fhirrouter';
import { FhirRepository, RepositoryMode } from '../repo';
import { getGraphQLInputType } from './input-types';
import { buildGraphQLOutputType, getGraphQLOutputType, outputTypeCache } from './output-types';
import {
  applyMaxCount,
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
  } catch (_err) {
    return [badRequest('GraphQL syntax error.')];
  }

  const schema = getRootSchema();
  const validationRules = [...specifiedRules, MaxDepthRule(req.config?.graphqlMaxDepth), QueryCostRule(router)];
  const validationErrors = validate(schema, document, validationRules);
  if (validationErrors.length > 0) {
    return [invalidRequest(validationErrors)];
  }

  const introspection = isIntrospectionQuery(query);
  if (introspection && !router.options?.introspectionEnabled) {
    return [forbidden];
  }

  if (includesMutations(query)) {
    repo.setMode(RepositoryMode.WRITER);
  }

  const dataLoader = new DataLoader<Reference, Resource>((keys) => repo.readReferences(keys));

  let result: any = introspection && introspectionResults.get(query);
  if (!result) {
    const contextValue: GraphQLContext = {
      repo,
      config: req.config,
      dataLoader,
      searchCount: 0,
    };

    result = await execute({
      schema,
      document,
      contextValue,
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

/**
 * Returns true if the query includes mutations.
 * @param query - The GraphQL query.
 * @returns True if the query includes mutations.
 */
function includesMutations(query: string): boolean {
  return query.includes('mutation');
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
  if (!isFieldRequested(info, 'edges')) {
    searchRequest.count = 0;
  }
  applyMaxCount(searchRequest, ctx.config?.graphqlMaxSearches);
  const bundle = await ctx.repo.search(searchRequest);
  return {
    count: bundle.total,
    offset: searchRequest.offset ?? 0,
    pageSize: searchRequest.count ?? DEFAULT_SEARCH_COUNT,
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

const DEFAULT_MAX_DEPTH = 12;

/**
 * Custom GraphQL rule that enforces max depth constraint.
 * @param maxDepth - The maximum allowed depth.
 * @returns A function that is an ASTVisitor that validates the maximum depth rule.
 */
const MaxDepthRule =
  (maxDepth: number = DEFAULT_MAX_DEPTH) =>
  (context: ValidationContext): ASTVisitor => ({
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

const DEFAULT_MAX_COST = 10_000;

type QueryCostRuleOptions = {
  logger?: Logger;
  maxCost?: number;
  debug?: boolean;
};

const QueryCostRule =
  (router: FhirRouter, options?: QueryCostRuleOptions) =>
  (context: ValidationContext): ASTVisitor =>
    new QueryCostVisitor(context, router, options) as ASTVisitor;

class QueryCostVisitor {
  private context: ValidationContext;
  private maxCost: number;
  private debug: boolean;
  private router: FhirRouter;
  private fragmentCosts: Record<string, number>;

  constructor(context: ValidationContext, router: FhirRouter, options?: QueryCostRuleOptions) {
    this.context = context;
    this.maxCost = options?.maxCost ?? DEFAULT_MAX_COST;
    this.debug = options?.debug ?? false;
    this.router = router;
    this.fragmentCosts = Object.create(null);
  }

  OperationDefinition(node: OperationDefinitionNode): void {
    let cost = 0;
    for (const child of node.selectionSet.selections) {
      const startTime = process.hrtime.bigint();
      const childCost = this.calculateCost(child);
      cost += childCost;
      this.log(child.kind, 'node has final cost', childCost, '(', process.hrtime.bigint() - startTime, 'ns)');

      if (cost > this.maxCost) {
        // this.context.reportError(
        //   new GraphQLError('Query too complex', {
        //     extensions: { cost, limit: this.maxCost },
        //   })
        // );
        this.router.log('warn', 'GraphQL query too complex', {
          cost,
          limit: this.maxCost,
          query: node.loc?.source?.body,
        });
      }
    }
  }

  private calculateCost(...nodes: ASTNode[]): number {
    let cost = 0;
    for (const node of nodes) {
      if (node.kind === Kind.FIELD && node.selectionSet) {
        let baseCost = 0;
        let branchingFactor = 1;
        if (isSearchField(node)) {
          this.log('Found search field', node.name.value);
          baseCost = 8;
          branchingFactor = this.getCount(node.arguments) ?? 20;
        } else if (isLinkedResource(node)) {
          this.log('Found linked resource');
          baseCost = 1;
          branchingFactor = 2;
        }

        const fieldCost = baseCost + branchingFactor * this.calculateCost(...node.selectionSet.selections);
        if (fieldCost) {
          this.log('Field', node.name.value, 'costs', fieldCost);
        }
        cost += fieldCost;
      } else if (node.kind === Kind.FRAGMENT_SPREAD) {
        const fragmentName = node.name.value;
        const fragment = this.context.getFragment(fragmentName);
        const cachedCost = this.fragmentCosts[fragmentName];

        if (cachedCost !== undefined) {
          this.log('Fragment', fragmentName, 'costs', cachedCost, '(cached)');
          cost += cachedCost;
        } else if (fragment) {
          const fragmentCost = this.calculateCost(...fragment.selectionSet.selections);
          this.fragmentCosts[fragmentName] = fragmentCost;
          this.log('Fragment', fragmentName, 'costs', fragmentCost);
          cost += fragmentCost;
        }
      } else if (node.kind === Kind.INLINE_FRAGMENT) {
        const fragmentCost = this.calculateCost(...node.selectionSet.selections);
        this.log('Inline fragment on', node.typeCondition?.name.value, 'costs', fragmentCost);
        cost += fragmentCost;
      }

      if (cost > this.maxCost) {
        return cost; // Short circuit return, no need to keep processing
      }
    }

    return cost;
  }

  getCount(args?: readonly ArgumentNode[]): number | undefined {
    const countArg = args?.find((arg) => arg.name.value === '_count');
    if (countArg?.value.kind === Kind.INT) {
      return parseInt(countArg.value.value, 10);
    }
    return undefined;
  }

  log(...args: any[]): void {
    if (this.debug) {
      console.log(...args);
    }
  }
}

function isSearchField(node: FieldNode): boolean {
  return node.name.value.endsWith('List');
}

function isLinkedResource(node: FieldNode): boolean {
  return node.name.value === 'resource';
}
