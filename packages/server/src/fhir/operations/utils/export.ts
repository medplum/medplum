// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import type { SearchRequest, WithId } from '@medplum/core';
import {
  arrayify,
  badRequest,
  flatMapFilter,
  OperationOutcomeError,
  Operator,
  parseSearchRequest,
  singularize,
  validateResourceType,
} from '@medplum/core';
import type { FhirRequest } from '@medplum/fhir-router';
import type { Resource } from '@medplum/fhirtypes';
import type { Repository } from '../../repo';
import { getSelectQueryForSearch } from '../../search';
import { makeOperationDefinition } from '../definitions';
import { parseInputParameters } from './parameters';
import { uniqueOn } from './terminology';

export interface ExportParameters {
  types?: string[];
  typeFilters: string[];
  since?: string;
}

const operation = makeOperationDefinition(
  { scope: 'system' },
  {
    name: 'export',
    code: 'export',
    parameter: [
      { use: 'in', name: '_type', type: 'string', min: 0, max: '*' },
      { use: 'in', name: '_typeFilter', type: 'string', min: 0, max: '*' },
      { use: 'in', name: '_since', type: 'instant', min: 0, max: '1' },
    ],
  }
);

type ExportInput = { _type?: string[]; _typeFilter?: string[]; _since?: string };

export function parseExportParameters(req: FhirRequest): ExportParameters {
  const input: ExportInput =
    req.method === 'POST' && req.body?.resourceType === 'Parameters'
      ? parseInputParameters<ExportInput>(operation, req)
      : {};
  // Body values take precedence, while retaining existing query-string requests.
  const types = input._type?.length ? input._type : arrayify(req.query._type);
  return {
    types: types
      ? uniqueOn(
          flatMapFilter(types, (type) => type?.split(',')),
          (type) => type
        )
      : undefined,
    typeFilters: input._typeFilter?.length ? input._typeFilter : (arrayify(req.query._typeFilter) ?? []),
    since: input._since ?? singularize(req.query._since),
  };
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
