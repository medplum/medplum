// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import {
  allOk,
  append,
  flatMapFilter,
  getReferenceString,
  isReference,
  isResource,
  Operator,
  SearchRequest,
  sortStringArray,
  WithId,
} from '@medplum/core';
import { FhirRequest, FhirResponse } from '@medplum/fhir-router';
import {
  Bundle,
  BundleEntry,
  CompartmentDefinitionResource,
  Patient,
  Reference,
  Resource,
  ResourceType,
} from '@medplum/fhirtypes';
import { getAuthenticatedContext } from '../../context';
import { getPatientCompartments } from '../patient';
import { Repository } from '../repo';
import { getOperationDefinition } from './definitions';
import { filterByCareDate } from './utils/caredate';
import { parseInputParameters } from './utils/parameters';

const operation = getOperationDefinition('Patient', 'everything');

const defaultMaxResults = 1000;

export interface PatientEverythingParameters {
  start?: string;
  end?: string;
  _since?: string;
  _count?: number;
  _offset?: number;
  _type?: ResourceType[];
}

// Patient everything operation.
// https://hl7.org/fhir/operation-patient-everything.html

/**
 * Handles a Patient everything request.
 * Searches for all resources related to the patient.
 * @param req - The FHIR request.
 * @returns The FHIR response.
 */
export async function patientEverythingHandler(req: FhirRequest): Promise<FhirResponse> {
  const ctx = getAuthenticatedContext();
  const { id } = req.params;
  const params = parseInputParameters<PatientEverythingParameters>(operation, req);

  // First read the patient to verify access
  const patient = await ctx.repo.readResource<Patient>('Patient', id);

  // Then read all of the patient data
  const bundle = await getPatientEverything(ctx.repo, patient, params);

  return [allOk, bundle];
}

/**
 * Executes the Patient $everything operation.
 * Searches for all resources related to the patient.
 * @param repo - The repository.
 * @param patient - The root patient.
 * @param params - The operation input parameters.
 * @returns The patient everything search result bundle.
 */
export async function getPatientEverything(
  repo: Repository,
  patient: WithId<Patient>,
  params?: PatientEverythingParameters
): Promise<Bundle<WithId<Resource>>> {
  // First get all compartment resources
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
  const bundle = await searchPatientCompartment(repo, patient, search);

  // Filter by requested date range
  filterByCareDate(bundle, params?.start, params?.end);

  // Recursively resolve references to resources not in the official compartment, but
  // which should be included for completeness
  await addResolvedReferences(repo, bundle.entry);
  return bundle;
}

export async function searchPatientCompartment(
  repo: Repository,
  target: WithId<Resource>,
  search?: Partial<SearchRequest>
): Promise<Bundle<WithId<Resource>>> {
  const resourceList = getPatientCompartments().resource as CompartmentDefinitionResource[];
  const types = search?.types ?? resourceList.map((r) => r.code as ResourceType).filter((t) => t !== 'Binary');
  types.push(target.resourceType);
  sortStringArray(types);

  const filters = search?.filters ?? [];
  filters.push({
    code: '_compartment',
    operator: Operator.EQUALS,
    value: getReferenceString(target),
  });

  // Get initial bundle of compartment resources
  return repo.search({
    resourceType: target.resourceType,
    types,
    filters,
    count: search?.count ?? defaultMaxResults,
    offset: search?.offset,
  });
}

/**
 * Recursively resolves references in the given resources.
 * @param repo - The repository.
 * @param entries - The initial resources to process.
 */
async function addResolvedReferences(repo: Repository, entries: BundleEntry[] | undefined): Promise<void> {
  const processedRefs = new Set<string>();
  let page = entries;
  while (page?.length) {
    const references = processReferencesFromResources(page, processedRefs);
    const resolved = await repo.readReferences(references);
    page = flatMapFilter(resolved, (resource) =>
      isResource(resource) ? { resource, search: { mode: 'include' } } : undefined
    );
    entries?.push(...page);
  }
}

function processReferencesFromResources(toProcess: BundleEntry[], processedRefs: Set<string>): Reference[] {
  const references = new Set<string>();
  for (const entry of toProcess) {
    const resource = entry.resource as WithId<Resource>;
    const refString = getReferenceString(resource);
    if (processedRefs.has(refString)) {
      continue;
    } else {
      processedRefs.add(refString);
    }

    // Find all references in the resource
    const candidateRefs = collectReferences(resource);
    for (const reference of candidateRefs) {
      if (!processedRefs.has(reference) && shouldResolveReference(reference)) {
        references.add(reference);
      }
    }
  }

  const result: Reference[] = [];
  for (const reference of references) {
    result.push({ reference });
  }
  return result;
}

// Most relevant resource types are already included in the Patient compartment, so
// only references of select other types need to be resolved
const allowedReferenceTypes = /^(Organization|Location|Practitioner|PractitionerRole|Medication|Device)\//;
function shouldResolveReference(refString: string): boolean {
  return allowedReferenceTypes.test(refString);
}

function collectReferences(resource: any, foundReferences = new Set<string>()): Set<string> {
  for (const key in resource) {
    if (resource[key] && typeof resource[key] === 'object') {
      const value = resource[key];
      if (isReference(value)) {
        foundReferences.add(value.reference);
      } else {
        collectReferences(value, foundReferences);
      }
    }
  }
  return foundReferences;
}
