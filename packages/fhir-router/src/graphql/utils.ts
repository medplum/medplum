// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
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
  searchDataLoaders: Record<string, DataLoader<Filter, Resource[]>>;
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

function parseSearchArgsWithReference(
  resourceType: ResourceType,
  source: any,
  args: Record<string, string>
): { searchRequest: SearchRequest; referenceFilter: Filter | undefined } {
  let referenceFilter: Filter | undefined = undefined;
  if (source) {
    // _reference is a required field for reverse lookup searches
    // The GraphQL parser will validate that it is there.
    const reference = args['_reference'];
    delete args['_reference'];
    referenceFilter = {
      code: reference,
      operator: Operator.EQUALS,
      value: getReferenceString(source),
    };
  }

  // Reverse the transform of dashes to underscores, back to dashes
  args = Object.fromEntries(Object.entries(args).map(([key, value]) => [graphQLFieldToFhirParam(key), value]));

  // Parse the search request
  const searchRequest = parseSearchRequest(resourceType, args);
  return { searchRequest, referenceFilter };
}

function addFilter(searchRequest: SearchRequest, filter: Filter): void {
  const existingFilters = searchRequest.filters || [];
  searchRequest.filters = [filter, ...existingFilters];
}

export function parseSearchArgs(resourceType: ResourceType, source: any, args: Record<string, string>): SearchRequest {
  const { searchRequest, referenceFilter } = parseSearchArgsWithReference(resourceType, source, args);

  if (referenceFilter) {
    addFilter(searchRequest, referenceFilter);
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

function sortedStringify(obj: any): string {
  const customReplacer = (key: any, value: any): any => {
    if (value && typeof value === 'object' && !Array.isArray(value)) {
      return Object.keys(value)
        .sort((a, b) => a.localeCompare(b))
        .reduce((sorted: any, key: string) => {
          sorted[key] = value[key];
          return sorted;
        }, {});
    }
    return value;
  };

  return JSON.stringify(obj, customReplacer);
}

/**
 * GraphQL data loader for search requests.
 * The field name should always end with "List" (i.e., "Patient" search uses "PatientList").
 * The search args should be FHIR search parameters.
 * @param source - The source/root.  This should always be null for our top level readers.
 * @param args - The GraphQL search arguments.
 * @param ctx - The GraphQL context.
 * @param info - The GraphQL resolve info.  This includes the schema, and additional field details.
 * @returns Promise to read the resources for the query.
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

  const { searchRequest, referenceFilter } = parseSearchArgsWithReference(resourceType, source, args);
  applyMaxCount(searchRequest, ctx.config?.graphqlMaxSearches);

  const maxBatchSize = ctx.config?.graphqlBatchedSearchSize ?? 0;
  if (maxBatchSize === 0 || !referenceFilter) {
    if (referenceFilter) {
      addFilter(searchRequest, referenceFilter);
    }
    const bundle = await ctx.repo.search(searchRequest);
    return bundle.entry?.map((e) => e.resource as Resource);
  }

  const hash = sortedStringify(searchRequest);
  const dl = (ctx.searchDataLoaders[hash] ??= buildResolveBySearchDataLoader(ctx.repo, searchRequest, maxBatchSize));
  return dl.load(referenceFilter);
}

function buildResolveBySearchDataLoader(
  repo: FhirRepository,
  searchRequest: SearchRequest,
  maxBatchSize: number
): DataLoader<Filter, Resource[]> {
  return new DataLoader<Filter, Resource[]>(
    async (filters) => {
      const results = await repo.searchByReference(
        searchRequest,
        filters[0].code,
        filters.map((f) => f.value)
      );
      return filters.map((filter) => results[filter.value]);
    },
    { maxBatchSize }
  );
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
