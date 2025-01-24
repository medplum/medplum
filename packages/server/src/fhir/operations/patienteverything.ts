import {
  allOk,
  getReferenceString,
  Operator,
  sortStringArray,
  isReference,
  isResource,
  flatMapFilter,
} from '@medplum/core';
import { FhirRequest, FhirResponse } from '@medplum/fhir-router';
import {
  Bundle,
  CompartmentDefinitionResource,
  Patient,
  ResourceType,
  Resource,
  Reference,
  BundleEntry,
} from '@medplum/fhirtypes';
import { getAuthenticatedContext } from '../../context';
import { getPatientCompartments } from '../patient';
import { Repository } from '../repo';
import { getOperationDefinition } from './definitions';
import { parseInputParameters } from './utils/parameters';

const operation = getOperationDefinition('Patient', 'everything');

const defaultMaxResults = 1000;

type PatientEverythingParameters = {
  _since?: string;
  _count?: number;
  _offset?: number;
};

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
  const types = resourceList.map((r) => r.code as ResourceType).filter((t) => t !== 'Binary');
  sortStringArray(types);

  const filters = [
    {
      code: '_compartment',
      operator: Operator.EQUALS,
      value: getReferenceString(patient),
    },
  ];

  if (params?._since) {
    filters.push({
      code: '_lastUpdated',
      operator: Operator.GREATER_THAN_OR_EQUALS,
      value: params._since,
    });
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
  const resolvedEntries = await resolveReferences(repo, bundle.entry);

  // Update bundle with all resolved resources
  bundle.entry?.push(...resolvedEntries);
  return bundle;
}

/**
 * Recursively resolves references in the given resources.
 * @param repo - The repository.
 * @param entries - The initial resources to process.
 * @param processedRefs - Set of already processed reference strings (internal use).
 * @returns Array of all resolved resources.
 */
async function resolveReferences(
  repo: Repository,
  entries: BundleEntry[] | undefined,
  processedRefs = new Set<string>()
): Promise<BundleEntry[]> {
  const result: BundleEntry[] = [];
  while (entries?.length) {
    const references = processReferencesFromResources(entries, processedRefs);
    const resolved = await repo.readReferences(references);
    entries = flatMapFilter(resolved, (resource) =>
      isResource(resource) ? { resource, search: { mode: 'include' } } : undefined
    );
    result.push(...entries);
  }
  return result;
}

function processReferencesFromResources(toProcess: BundleEntry[], processedRefs: Set<string>): Reference[] {
  const references: Reference[] = [];
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
        references.push({ reference });
        processedRefs.add(reference);
      }
    }
  }
  return references;
}

// Most relevant resource types are already included in the Patient compartment, so
// only references of select other types need to be resolved
const allowedReferenceTypes = /^(Organization|Location|Practitioner|Medication)\//;
function shouldResolveReference(refString: string): boolean {
  return Boolean(allowedReferenceTypes.exec(refString));
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
