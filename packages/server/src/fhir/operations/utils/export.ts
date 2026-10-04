// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import type { SearchRequest, WithId } from '@medplum/core';
import {
  badRequest,
  OperationOutcomeError,
  Operator,
  parseSearchRequest,
  singularize,
  validateResource,
  validateResourceType,
} from '@medplum/core';
import type { FhirRequest } from '@medplum/fhir-router';
import type { Parameters, Resource } from '@medplum/fhirtypes';
import type { Repository } from '../../repo';
import { getSelectQueryForSearch, isChainedSearchFilter, parseChainedParameter } from '../../search';

export interface ExportParameters {
  types?: string[];
  typeFilters: string[];
  since?: string;
}

export function parseExportParameters(req: FhirRequest): ExportParameters {
  const body = req.body as Parameters | undefined;
  const parameters = req.method === 'POST' && body?.resourceType === 'Parameters' ? body : undefined;
  if (parameters) {
    validateResource(parameters);
  }

  // Preserve POST query parameters used by existing clients; body values take precedence.
  const types = getStrings('_type');
  if (parameters?.parameter?.some((p) => p.name === '_type') && types?.some((type) => type.includes(','))) {
    throw new OperationOutcomeError(badRequest('Repeat _type parameters instead of comma-delimiting POST values'));
  }
  const since = parameters?.parameter?.find((p) => p.name === '_since')?.valueInstant ?? singularize(req.query._since);
  return { types: types ? [...new Set(types)] : undefined, typeFilters: getStrings('_typeFilter') ?? [], since };

  function getStrings(name: '_type' | '_typeFilter'): string[] | undefined {
    const entries = parameters?.parameter?.filter((p) => p.name === name);
    if (entries?.length) {
      return entries.map((p) => {
        if (typeof p.valueString !== 'string' || !p.valueString) {
          throw new OperationOutcomeError(badRequest(`${name} requires valueString`));
        }
        return p.valueString;
      });
    }
    const query = req.query[name];
    if (query === undefined) {
      return undefined;
    }
    const values = Array.isArray(query) ? query : [query];
    // Retain the older GET/SDK query-string form, while POST Parameters use repeated entries.
    return name === '_type' ? values.flatMap((value) => value.split(',')) : values;
  }
}

// Result controls and scope-changing extensions cannot be used as export criteria.
const prohibitedFilterParameters = new Set([
  '_sort',
  '_count',
  '_offset',
  '_cursor',
  '_total',
  '_summary',
  '_include',
  '_revinclude',
  '_elements',
  '_fields',
  '_contained',
  '_containedType',
  '_format',
  '_pretty',
  '_type',
  '_compartment',
  '_deleted',
  '_',
]);

export function parseExportTypeFilters(repo: Repository, values: string[]): SearchRequest[] {
  return values.map((value) => {
    const match = /^([A-Za-z][A-Za-z0-9]*)\?([^#?]+)$/.exec(value);
    if (!match) {
      throw new OperationOutcomeError(badRequest('_typeFilter must be a search on a single resource type'));
    }
    try {
      decodeURIComponent(match[2]);
    } catch {
      throw new OperationOutcomeError(badRequest('Invalid URL encoding in _typeFilter'));
    }
    validateResourceType(match[1]);
    for (const [key, value] of new URLSearchParams(match[2])) {
      if (prohibitedFilterParameters.has(key.split(':')[0])) {
        throw new OperationOutcomeError(badRequest(`Search parameter ${key} is not permitted in _typeFilter`));
      }
      // The general search parser tolerates some unknown modifiers by dropping them.
      // Export criteria must not silently become a different search.
      try {
        const parsed = parseSearchRequest(match[1], { [key]: value }).filters?.[0];
        const filter =
          parsed && isChainedSearchFilter(parsed) ? parseChainedParameter(match[1], parsed).filter : parsed;
        // Strip chain links only to compare the terminal parameter with the parsed operator.
        const terminalKey = key
          .replace(/_has:[^:.]+:[^:.]+:/g, '')
          .split('.')
          .at(-1);
        if (filter && terminalKey !== filter.code && terminalKey !== `${filter.code}:${filter.operator}`) {
          throw new OperationOutcomeError(badRequest(`Unsupported search modifier in _typeFilter: ${key}`));
        }
      } catch (err) {
        if (err instanceof OperationOutcomeError) {
          throw err;
        }
        throw new OperationOutcomeError(badRequest(`Unsupported _typeFilter search parameter: ${key}`));
      }
    }
    const search = parseSearchRequest(value);
    if (!search.filters?.length) {
      throw new OperationOutcomeError(badRequest('_typeFilter must contain search criteria'));
    }
    // Compile through the normal search engine before creating the job, so unsupported
    // parameters, modifiers and expressions return an OperationOutcome at kickoff.
    try {
      getSelectQueryForSearch(repo, { ...search, count: 1 });
    } catch (err) {
      if (err instanceof OperationOutcomeError) {
        throw err;
      }
      throw new OperationOutcomeError(badRequest('Unsupported _typeFilter search expression'));
    }
    return search;
  });
}

/**
 * Filters Group export candidates without turning a Patient filter into a cohort restriction.
 * @param repo - The caller's repository.
 * @param resources - Resources already within the Group export scope.
 * @param typeFilters - Alternative searches, applied independently to each resource type.
 * @returns The candidates matching at least one filter for their type, or having no filter.
 */
export async function filterExportResources(
  repo: Repository,
  resources: WithId<Resource>[],
  typeFilters: SearchRequest[]
): Promise<WithId<Resource>[]> {
  const filteredTypes = new Set(typeFilters.map((search) => search.resourceType));
  const matches = new Set<string>();
  for (const search of typeFilters) {
    const ids = resources
      .filter((resource) => resource.resourceType === search.resourceType)
      .map((resource) => resource.id);
    if (!ids.length) {
      continue;
    }
    await repo.processAllResources(
      {
        ...search,
        count: 1000,
        filters: [...(search.filters ?? []), { code: '_id', operator: Operator.EQUALS, value: ids.join(',') }],
        sortRules: [{ code: '_lastUpdated', descending: false }],
      },
      async (resource) => {
        matches.add(`${resource.resourceType}/${resource.id}`);
      }
    );
  }
  return resources.filter(
    (resource) => !filteredTypes.has(resource.resourceType) || matches.has(`${resource.resourceType}/${resource.id}`)
  );
}
