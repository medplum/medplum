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
import { getSelectQueryForSearch } from '../../search';

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

export function parseExportTypeFilters(repo: Repository, values: string[]): SearchRequest[] {
  return values.map((value) => {
    const search = parseSearchRequest(value);
    validateResourceType(search.resourceType);
    if (value.split('?')[0] !== search.resourceType) {
      throw new OperationOutcomeError(badRequest('_typeFilter must be a search on a single resource type'));
    }
    // Only selection criteria are allowed, not result controls such as _include or _sort.
    if (
      Object.keys(search).some((key) => key !== 'resourceType' && key !== 'filters') ||
      search.filters?.some((filter) => filter.code === '_deleted' || filter.code === '_compartment')
    ) {
      throw new OperationOutcomeError(
        badRequest('Search result controls and scope overrides are not permitted in _typeFilter')
      );
    }
    // Use normal search validation before starting an asynchronous export.
    getSelectQueryForSearch(repo, { ...search, count: 1 });
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
