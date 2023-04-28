import {
  allOk,
  badRequest,
  buildTypeName,
  capitalize,
  DEFAULT_SEARCH_COUNT,
  evalFhirPathTyped,
  Filter,
  forbidden,
  getElementDefinition,
  getReferenceString,
  getResourceTypes,
  getResourceTypeSchema,
  getSearchParameters,
  globalSchema,
  isLowerCase,
  isResourceTypeSchema,
  LRUCache,
  normalizeOperationOutcome,
  OperationOutcomeError,
  Operator,
  parseSearchRequest,
  SearchRequest,
  toJsBoolean,
  toTypedValue,
} from '@medplum/core';
import {
  ElementDefinition,
  ElementDefinitionType,
  OperationOutcome,
  Reference,
  Resource,
  ResourceType,
} from '@medplum/fhirtypes';
import DataLoader from 'dataloader';
import {
  ASTNode,
  ASTVisitor,
  DocumentNode,
  execute,
  ExecutionResult,
  GraphQLBoolean,
  GraphQLEnumType,
  GraphQLEnumValueConfigMap,
  GraphQLError,
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
  specifiedRules,
  validate,
  ValidationContext,
} from 'graphql';
import { FhirRequest, FhirResponse } from './fhirrouter';
import { FhirRepository } from './repo';

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
  'http://hl7.org/fhirpath/System.Boolean': GraphQLBoolean,
  'http://hl7.org/fhirpath/System.Date': GraphQLString,
  'http://hl7.org/fhirpath/System.DateTime': GraphQLString,
  'http://hl7.org/fhirpath/System.Decimal': GraphQLFloat,
  'http://hl7.org/fhirpath/System.Integer': GraphQLFloat,
  'http://hl7.org/fhirpath/System.String': GraphQLString,
  'http://hl7.org/fhirpath/System.Time': GraphQLString,
};

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

interface GraphQLContext {
  repo: FhirRepository;
  dataLoader: DataLoader<Reference, Resource>;
}

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
 */
export async function graphqlHandler(req: FhirRequest, repo: FhirRepository): Promise<FhirResponse> {
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
  if (introspection) {
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
 *
 * @param query The GraphQL query.
 * @returns True if the query is an introspection query.
 */
function isIntrospectionQuery(query: string): boolean {
  return query.includes('query IntrospectionQuery') || query.includes('__schema') || query.includes('__type');
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
    typeCache[resourceType] = buildGraphQLType(resourceType);
  }

  // Next, fill in all of the type properties
  const fields: GraphQLFieldConfigMap<any, GraphQLContext> = {};
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

    // FHIR GraphQL Connection API
    fields[resourceType + 'Connection'] = {
      type: buildConnectionType(resourceType, graphQLType),
      args: buildSearchArgs(resourceType),
      resolve: resolveByConnectionApi,
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
    typeCache[resourceType] = result;
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

  const schema = getResourceTypeSchema(resourceType);
  return new GraphQLObjectType({
    name: resourceType,
    description: schema.description,
    fields: () => buildGraphQLFields(resourceType as ResourceType),
  });
}

function buildGraphQLFields(resourceType: ResourceType): GraphQLFieldConfigMap<any, any> {
  const fields: GraphQLFieldConfigMap<any, any> = {};
  buildPropertyFields(resourceType, fields);
  buildReverseLookupFields(resourceType, fields);
  return fields;
}

function buildPropertyFields(resourceType: string, fields: GraphQLFieldConfigMap<any, any>): void {
  const schema = getResourceTypeSchema(resourceType);
  const properties = schema.properties;

  if (isResourceTypeSchema(schema)) {
    fields.resourceType = {
      type: new GraphQLNonNull(GraphQLString),
      description: 'Resource Type',
    };
  }

  if (resourceType === 'Reference') {
    fields.resource = {
      description: 'Reference',
      type: getGraphQLType('ResourceList'),
      resolve: resolveByReference,
    };
  }

  for (const key of Object.keys(properties)) {
    const elementDefinition = getElementDefinition(resourceType, key) as ElementDefinition;
    for (const type of elementDefinition.type as ElementDefinitionType[]) {
      buildPropertyField(fields, key, elementDefinition, type);
    }
  }
}

function buildPropertyField(
  fields: GraphQLFieldConfigMap<any, any>,
  key: string,
  elementDefinition: ElementDefinition,
  elementDefinitionType: ElementDefinitionType
): void {
  let typeName = elementDefinitionType.code as string;
  if (typeName === 'Element' || typeName === 'BackboneElement') {
    typeName = buildTypeName(elementDefinition.path?.split('.') as string[]);
  }

  const fieldConfig: GraphQLFieldConfig<any, any> = {
    description: elementDefinition.short,
    type: getPropertyType(elementDefinition, typeName),
    resolve: resolveField,
  };

  if (elementDefinition.max === '*') {
    fieldConfig.args = buildListPropertyFieldArgs(typeName);
  }

  const propertyName = key.replace('[x]', capitalize(elementDefinitionType.code as string));
  fields[propertyName] = fieldConfig;
}

/**
 * Builds field arguments for a list property.
 *
 * The FHIR GraphQL specification defines the following arguments for list properties:
 *   1. _count: Specify how many elements to return from a repeating list.
 *   2. _offset: Specify the offset to start at for a repeating element.
 *   3. fhirpath: A FHIRPath statement selecting which of the subnodes is to be included.
 *   4. All properties of the list element type.
 *
 * See: https://hl7.org/fhir/R4/graphql.html#list
 *
 * @param fieldTypeName The type name of the field.
 * @returns The arguments for the field.
 */
function buildListPropertyFieldArgs(fieldTypeName: string): GraphQLFieldConfigArgumentMap {
  const fieldArgs: GraphQLFieldConfigArgumentMap = {
    _count: {
      type: GraphQLInt,
      description: 'Specify how many elements to return from a repeating list.',
    },
    _offset: {
      type: GraphQLInt,
      description: 'Specify the offset to start at for a repeating element.',
    },
  };

  if (!isLowerCase(fieldTypeName.charAt(0))) {
    // If this is a backbone element, add "fhirpath" and all properties as arguments
    fieldArgs.fhirpath = {
      type: GraphQLString,
      description: 'A FHIRPath statement selecting which of the subnodes is to be included',
    };

    // Add all "string" and "code" properties as arguments
    const fieldTypeSchema = globalSchema.types[fieldTypeName];
    if (fieldTypeSchema.properties) {
      for (const fieldKey of Object.keys(fieldTypeSchema.properties)) {
        const fieldElementDefinition = getElementDefinition(fieldTypeName, fieldKey) as ElementDefinition;
        for (const type of fieldElementDefinition.type as ElementDefinitionType[]) {
          buildListPropertyFieldArg(fieldArgs, fieldKey, fieldElementDefinition, type);
        }
      }
    }
  }

  return fieldArgs;
}

/**
 * Builds a field argument for a list property.
 * @param fieldArgs The output argument map.
 * @param fieldKey The key of the field.
 * @param elementDefinition The FHIR element definition of the field.
 * @param elementDefinitionType The FHIR element definition type of the field.
 */
function buildListPropertyFieldArg(
  fieldArgs: GraphQLFieldConfigArgumentMap,
  fieldKey: string,
  elementDefinition: ElementDefinition,
  elementDefinitionType: ElementDefinitionType
): void {
  const baseType = elementDefinitionType.code as string;
  const fieldName = fieldKey.replace('[x]', capitalize(baseType));
  switch (baseType) {
    case 'canonical':
    case 'code':
    case 'id':
    case 'oid':
    case 'string':
    case 'uri':
    case 'url':
    case 'uuid':
    case 'http://hl7.org/fhirpath/System.String':
      fieldArgs[fieldName] = {
        type: GraphQLString,
        description: elementDefinition.short,
      };
      break;
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
function buildReverseLookupFields(resourceType: ResourceType, fields: GraphQLFieldConfigMap<any, any>): void {
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

function getPropertyType(elementDefinition: ElementDefinition, typeName: string): GraphQLOutputType {
  const graphqlType = getGraphQLType(typeName);
  if (elementDefinition.max === '*') {
    return new GraphQLList(graphqlType);
  }
  return graphqlType;
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
 * @param source The source/root.  This should always be null for our top level readers.
 * @param args The GraphQL search arguments.
 * @param ctx The GraphQL context.
 * @param info The GraphQL resolve info.  This includes the schema, and additional field details.
 * @returns Promise to read the resoures for the query.
 * @implements {GraphQLFieldResolver}
 */
async function resolveBySearch(
  source: any,
  args: Record<string, string>,
  ctx: GraphQLContext,
  info: GraphQLResolveInfo
): Promise<Resource[] | undefined> {
  const fieldName = info.fieldName;
  const resourceType = fieldName.substring(0, fieldName.length - 'List'.length) as ResourceType;
  const searchRequest = parseSearchArgs(resourceType, source, args);
  const bundle = await ctx.repo.search(searchRequest);
  return bundle.entry?.map((e) => e.resource as Resource);
}

/**
 * GraphQL data loader for search requests.
 * The field name should always end with "List" (i.e., "Patient" search uses "PatientList").
 * The search args should be FHIR search parameters.
 * @param source The source/root.  This should always be null for our top level readers.
 * @param args The GraphQL search arguments.
 * @param ctx The GraphQL context.
 * @param info The GraphQL resolve info.  This includes the schema, and additional field details.
 * @returns Promise to read the resoures for the query.
 * @implements {GraphQLFieldResolver}
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
 * @param _source The source/root.  This should always be null for our top level readers.
 * @param args The GraphQL search arguments.
 * @param ctx The GraphQL context.
 * @param info The GraphQL resolve info.  This includes the schema, and additional field details.
 * @returns Promise to read the resoure for the query.
 * @implements {GraphQLFieldResolver}
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
 * GraphQL data loader for Reference requests.
 * This is a special data loader for following Reference objects.
 * @param source The source/root.  This should always be null for our top level readers.
 * @param _args The GraphQL search arguments.
 * @param ctx The GraphQL context.
 * @returns Promise to read the resoure(s) for the query.
 * @implements {GraphQLFieldResolver}
 */
async function resolveByReference(source: any, _args: any, ctx: GraphQLContext): Promise<Resource | undefined> {
  try {
    return await ctx.dataLoader.load(source as Reference);
  } catch (err) {
    throw new OperationOutcomeError(normalizeOperationOutcome(err), err);
  }
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

/**
 * GraphQL resolver for fields.
 * In the common case, this is just a matter of returning the field value from the source object.
 * If the field is a list and the user specifies list arguments, then we can apply those arguments here.
 * @param source The source. This is the object that contains the field.
 * @param args The GraphQL search arguments.
 * @param _ctx The GraphQL context.
 * @param info The GraphQL resolve info.  This includes the field name.
 * @returns Promise to read the resoure for the query.
 * @implements {GraphQLFieldResolver}
 */
async function resolveField(source: any, args: any, _ctx: GraphQLContext, info: GraphQLResolveInfo): Promise<any> {
  const fieldValue = source?.[info.fieldName];
  if (!args || !fieldValue) {
    return fieldValue;
  }

  const { _offset, _count, fhirpath, ...rest } = args;
  let array = fieldValue as any[];

  for (const [key, value] of Object.entries(rest)) {
    array = array.filter((item) => item[key] === value);
  }

  if (fhirpath) {
    array = array.filter((item) => toJsBoolean(evalFhirPathTyped(fhirpath, [toTypedValue(item)])));
  }

  if (_offset) {
    array = array.slice(_offset);
  }

  if (_count) {
    array = array.slice(0, _count);
  }

  return array;
}

function parseSearchArgs(resourceType: ResourceType, source: any, args: Record<string, string>): SearchRequest {
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

/**
 * Custom GraphQL rule that enforces max depth constraint.
 * @param context The validation context.
 * @returns An ASTVisitor that validates the maximum depth rule.
 */
const MaxDepthRule = (context: ValidationContext): ASTVisitor => ({
  Field(
    /** The current node being visiting. */
    node: any,
    /** The index or key to this node from the parent node or Array. */
    _key: string | number | undefined,
    /** The parent immediately above this node, which may be an Array. */
    _parent: ASTNode | ReadonlyArray<ASTNode> | undefined,
    /** The key path to get to this node from the root node. */
    path: ReadonlyArray<string | number>
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

/**
 * Returns the depth of the GraphQL node in a query.
 * We use "selections" as the representation of depth.
 * As a rough approximation, it's the number of indentations in a well formatted query.
 * @param path The GraphQL node path.
 * @returns The "depth" of the node.
 */
function getDepth(path: ReadonlyArray<string | number>): number {
  return path.filter((p) => p === 'selections').length;
}

/**
 * Returns true if the field is requested in the GraphQL query.
 * @param info The GraphQL resolve info.  This includes the field name.
 * @param fieldName The field name to check.
 * @returns True if the field is requested in the GraphQL query.
 */
function isFieldRequested(info: GraphQLResolveInfo, fieldName: string): boolean {
  return info.fieldNodes.some((fieldNode) =>
    fieldNode.selectionSet?.selections.some((selection) => {
      return selection.kind === 'Field' && selection.name.value === fieldName;
    })
  );
}

/**
 * Returns an OperationOutcome for GraphQL errors.
 * @param errors Array of GraphQL errors.
 * @returns OperationOutcome with the GraphQL errors as OperationOutcome issues.
 */
function invalidRequest(errors: ReadonlyArray<GraphQLError>): OperationOutcome {
  return {
    resourceType: 'OperationOutcome',
    issue: errors.map((error) => ({
      severity: 'error',
      code: 'invalid',
      details: { text: error.message },
    })),
  };
}
