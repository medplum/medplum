// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import type { SearchRequest, WithId } from '@medplum/core';
import { allOk, append, getReferenceString, Operator, parseReference, sortStringArray } from '@medplum/core';
import type { FhirRequest, FhirResponse } from '@medplum/fhir-router';
import type { Bundle, CompartmentDefinitionResource, Group, Resource, ResourceType } from '@medplum/fhirtypes';
import { getAuthenticatedContext } from '../../context';
import { getLogger } from '../../logger';
import { getPatientCompartments } from '../patient';
import type { Repository } from '../repo';
import { getFullUrl } from '../response';
import { getOperationDefinition } from './definitions';
import type { PatientEverythingParameters } from './patienteverything';
import { addResolvedReferences, removeDuplicateEntries } from './patienteverything';
import { filterByCareDate } from './utils/caredate';
import { parseInputParameters } from './utils/parameters';

const operation = getOperationDefinition('Group', 'everything');

const defaultMaxResults = 1000;

// https://hl7.org/fhir/operation-group-everything.html
/**
 * Handles a Group everything request.
 * Searches for all resources related to all patients in the group.
 * @param req - The FHIR request.
 * @returns The FHIR response.
 */
export async function groupEverythingHandler(req: FhirRequest): Promise<FhirResponse> {
  const ctx = getAuthenticatedContext();
  const { id } = req.params;
  const params = parseInputParameters<PatientEverythingParameters>(operation, req);

  const group = await ctx.repo.readResource<Group>('Group', id);
  const bundle = await getGroupEverything(ctx.repo, group, params);

  return [allOk, bundle];
}

/**
 * Executes the Group $everything operation.
 * Searches for all resources related to all patients in the group.
 * @param repo - The repository.
 * @param group - The group resource.
 * @param params - The operation input parameters.
 * @returns The group everything search result bundle.
 */
export async function getGroupEverything(
  repo: Repository,
  group: WithId<Group>,
  params?: PatientEverythingParameters
): Promise<Bundle<WithId<Resource>>> {
  // Collect patient and non-patient member references
  const patientRefs: string[] = [];
  const nonPatientRefs: { resourceType: ResourceType; id: string }[] = [];

  if (group.member) {
    for (const member of group.member) {
      if (!member.entity?.reference) {
        continue;
      }

      const [resourceType, memberId] = parseReference(member.entity);
      if (resourceType === 'Patient') {
        patientRefs.push(getReferenceString({ reference: member.entity.reference }));
      } else {
        nonPatientRefs.push({ resourceType, id: memberId });
      }
    }
  }

  // Build search request for all patient compartments at once
  const search: Partial<SearchRequest> = {
    types: params?._type,
    count: params?._count,
    offset: params?._offset,
  };

  if (params?._since) {
    search.filters = append(search.filters, {
      code: '_lastUpdated',
      operator: Operator.GREATER_THAN_OR_EQUALS,
      value: params._since,
    });
  }

  // Search all patient compartments in a single query
  const bundle = await searchGroupCompartments(repo, group, patientRefs, search);

  // Filter by requested date range
  filterByCareDate(bundle, params?.start, params?.end);

  // Add non-patient members to the bundle
  for (const ref of nonPatientRefs) {
    try {
      const resource = await repo.readResource(ref.resourceType, ref.id);
      bundle.entry?.push({
        fullUrl: getFullUrl(ref.resourceType, ref.id),
        search: { mode: 'match' },
        resource,
      });
    } catch (err) {
      getLogger().warn('Unable to read non-patient member for group everything', {
        reference: `${ref.resourceType}/${ref.id}`,
        error: err,
      });
    }
  }

  // Recursively resolve references to resources not in the official compartment
  await addResolvedReferences(repo, bundle.entry);
  bundle.entry = removeDuplicateEntries(bundle.entry);

  return bundle;
}

/**
 * Searches for all resources in the compartments of the given patients.
 * @param repo - The repository.
 * @param group - The group resource.
 * @param patientRefs - The patient reference strings (e.g., "Patient/123").
 * @param search - The partial search request with filters and pagination.
 * @returns The search result bundle.
 */
async function searchGroupCompartments(
  repo: Repository,
  group: WithId<Group>,
  patientRefs: string[],
  search?: Partial<SearchRequest>
): Promise<Bundle<WithId<Resource>>> {
  const resourceList = getPatientCompartments().resource as CompartmentDefinitionResource[];
  const types = search?.types ?? resourceList.map((r) => r.code).filter((t) => t !== 'Binary');

  // Include Group in the types
  if (!types.includes('Group')) {
    types.push('Group');
  }
  sortStringArray(types);

  const filters = search?.filters ?? [];

  // Add compartment filter for all patients (comma-separated)
  if (patientRefs.length > 0) {
    filters.push({
      code: '_compartment',
      operator: Operator.EQUALS,
      value: patientRefs.join(','),
    });
  }

  // If no patients, just return the group itself
  if (patientRefs.length === 0) {
    return {
      resourceType: 'Bundle',
      type: 'searchset',
      total: 1,
      entry: [
        {
          fullUrl: getFullUrl('Group', group.id),
          search: { mode: 'match' },
          resource: group,
        },
      ],
    };
  }

  // Search across all patient compartments
  const bundle = await repo.search({
    resourceType: 'Patient',
    types,
    filters,
    count: search?.count ?? defaultMaxResults,
    offset: search?.offset,
    sortRules: [{ code: '_id' }], // Must make sort deterministic to ensure pagination works correctly
  });

  // Add the group itself to the results
  bundle.entry = bundle.entry ?? [];
  bundle.entry.unshift({
    fullUrl: getFullUrl('Group', group.id),
    search: { mode: 'match' },
    resource: group,
  });

  if (bundle.total !== undefined) {
    bundle.total += 1;
  }

  return bundle;
}
