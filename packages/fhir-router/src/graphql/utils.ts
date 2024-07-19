import {
  DEFAULT_MAX_SEARCH_COUNT,
  DEFAULT_SEARCH_COUNT,
  Filter,
  getReferenceString,
  getSearchParameters,
  Operator,
  parseSearchRequest,
  SearchRequest,
} from '@medplum/core';
import { OperationOutcome, Reference, Resource, ResourceType } from '@medplum/fhirtypes';
import DataLoader from 'dataloader';
import {
  GraphQLBoolean,
  GraphQLError,
  GraphQLFieldConfigArgumentMap,
  GraphQLFloat,
  GraphQLID,
  GraphQLInt,
  GraphQLResolveInfo,
  GraphQLScalarType,
  GraphQLString,
  Kind,
} from 'graphql';
import { FhirRequestConfig } from '../fhirrouter';
import { FhirRepository } from '../repo';

export interface GraphQLContext {
  repo: FhirRepository;
  config?: FhirRequestConfig;
  dataLoader: DataLoader<Reference, Resource>;
  searchCount: number;
}

export const typeCache: Record<string, GraphQLScalarType | undefined> = {
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
  oid: GraphQLString,
  positiveInt: GraphQLFloat,
  string: GraphQLString,
  time: GraphQLString,
  unsignedInt: GraphQLFloat,
  uri: GraphQLString,
  url: GraphQLString,
  uuid: GraphQLString,
  xhtml: GraphQLString,
  'http://hl7.org/fhirpath/System.Boolean': GraphQLBoolean,
  'http://hl7.org/fhirpath/System.Date': GraphQLString,
  'http://hl7.org/fhirpath/System.DateTime': GraphQLString,
  'http://hl7.org/fhirpath/System.Decimal': GraphQLFloat,
  'http://hl7.org/fhirpath/System.Integer': GraphQLFloat,
  'http://hl7.org/fhirpath/System.String': GraphQLString,
  'http://hl7.org/fhirpath/System.Time': GraphQLString,
};

export function parseSearchArgs(resourceType: ResourceType, source: any, args: Record<string, string>): SearchRequest {
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

export function applyMaxCount(searchRequest: SearchRequest, maxCount: number | undefined): void {
  searchRequest.count = Math.min(searchRequest.count ?? DEFAULT_SEARCH_COUNT, maxCount ?? DEFAULT_MAX_SEARCH_COUNT);
}

export function graphQLFieldToFhirParam(code: string): string {
  return code.startsWith('_') ? code : code.replaceAll('_', '-');
}

export function fhirParamToGraphQLField(code: string): string {
  return code.replaceAll('-', '_');
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
export async function resolveBySearch(
  source: any,
  args: Record<string, string>,
  ctx: GraphQLContext,
  info: GraphQLResolveInfo
): Promise<Resource[] | undefined> {
  ctx.searchCount++;
  if (ctx.config?.graphqlMaxSearches && ctx.searchCount > ctx.config.graphqlMaxSearches) {
    throw new Error('Maximum number of searches exceeded');
  }

  const fieldName = info.fieldName;
  const resourceType = fieldName.substring(0, fieldName.length - 'List'.length) as ResourceType;
  const searchRequest = parseSearchArgs(resourceType, source, args);
  applyMaxCount(searchRequest, ctx.config?.graphqlMaxSearches);
  const bundle = await ctx.repo.search(searchRequest);
  return bundle.entry?.map((e) => e.resource as Resource);
}

export function buildSearchArgs(resourceType: string): GraphQLFieldConfigArgumentMap {
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
    _filter: {
      type: GraphQLString,
      description:
        ' The _filter parameter provides a syntax for expressing a set of query expressions on the underlying resources.',
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

/**
 * Returns the depth of the GraphQL node in a query.
 * We use "selections" as the representation of depth.
 * As a rough approximation, it's the number of indentations in a well formatted query.
 * @param path - The GraphQL node path.
 * @returns The "depth" of the node.
 */
export function getDepth(path: readonly (string | number)[]): number {
  return path.filter((p) => p === 'selections').length;
}

/**
 * Returns true if the field is requested in the GraphQL query.
 * @param info - The GraphQL resolve info.  This includes the field name.
 * @param fieldName - The field name to check.
 * @returns True if the field is requested in the GraphQL query.
 */
export function isFieldRequested(info: GraphQLResolveInfo, fieldName: string): boolean {
  return info.fieldNodes.some((fieldNode) =>
    fieldNode.selectionSet?.selections.some((selection) => {
      return selection.kind === Kind.FIELD && selection.name.value === fieldName;
    })
  );
}

/**
 * Returns an OperationOutcome for GraphQL errors.
 * @param errors - Array of GraphQL errors.
 * @returns OperationOutcome with the GraphQL errors as OperationOutcome issues.
 */
export function invalidRequest(errors: readonly GraphQLError[]): OperationOutcome {
  return {
    resourceType: 'OperationOutcome',
    issue: errors.map((error) => ({
      severity: 'error',
      code: 'invalid',
      details: { text: error.message },
    })),
  };
}
