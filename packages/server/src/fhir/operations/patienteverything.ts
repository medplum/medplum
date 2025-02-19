import {
  allOk,
  flatMapFilter,
  getReferenceString,
  isReference,
  isResource,
  Operator,
  sortStringArray,
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
  patient: Patient,
  params?: PatientEverythingParameters
): Promise<Bundle> {
  // First get all compartment resources
  const resourceList = getPatientCompartments().resource as CompartmentDefinitionResource[];
  const types = params?._type ?? resourceList.map((r) => r.code as ResourceType).filter((t) => t !== 'Binary');
  types.push('Patient');
  sortStringArray(types);

  const filters = [
    {
      code: '_compartment',
      operator: Operator.EQUALS,
      value: getReferenceString(patient),
    },
  ];

  if (params?.start) {
    filters.push({ code: '_lastUpdated', operator: Operator.GREATER_THAN_OR_EQUALS, value: params.start });
  }

  if (params?.end) {
    filters.push({ code: '_lastUpdated', operator: Operator.LESS_THAN_OR_EQUALS, value: params.end });
  }

  if (params?._since) {
    filters.push({ code: '_lastUpdated', operator: Operator.GREATER_THAN_OR_EQUALS, value: params._since });
  }

  // Get initial bundle of compartment resources
  const bundle = await repo.search({
    resourceType: 'Patient',
    types,
    filters,
    count: params?._count ?? defaultMaxResults,
    offset: params?._offset,
  });

  // Recursively resolve references
  await addResolvedReferences(repo, bundle.entry);
  return bundle;
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
    const resource = entry.resource as Resource;
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
const allowedReferenceTypes = /^(Organization|Location|Practitioner|Medication)\//;
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
