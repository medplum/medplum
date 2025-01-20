import { allOk, getReferenceString, Operator, sortStringArray, findReferences } from '@medplum/core';
import { FhirRequest, FhirResponse } from '@medplum/fhir-router';
import { Bundle, CompartmentDefinitionResource, Patient, ResourceType, Resource } from '@medplum/fhirtypes';
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
  types.push('Patient');
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
  const initialBundle = await repo.search({
    resourceType: 'Patient',
    types,
    filters,
    count: params?._count ?? defaultMaxResults,
    offset: params?._offset,
  });

  // Get all resources from the bundle
  const resources = initialBundle.entry?.map(e => e.resource) ?? [];
  
  // Recursively resolve all references
  const resolvedResources = await resolveReferences(repo, resources);
  
  // Create new bundle with all resolved resources
  return {
    resourceType: 'Bundle',
    type: 'searchset',
    entry: resolvedResources.map(resource => ({
      resource,
      fullUrl: `${resource.resourceType}/${resource.id}`,
    })),
    total: resolvedResources.length,
  };
}

/**
 * Recursively resolves all references in the given resources.
 * @param repo - The repository.
 * @param resources - The initial resources to process.
 * @param processedRefs - Set of already processed reference strings (internal use).
 * @returns Array of all resolved resources.
 */
async function resolveReferences(
  repo: Repository,
  resources: Resource[],
  processedRefs: Set<string> = new Set()
): Promise<Resource[]> {
  const result = new Set<Resource>();
  const toProcess = [...resources];

  while (toProcess.length > 0) {
    const resource = toProcess.pop()!;
    const refString = getReferenceString(resource);
    
    if (processedRefs.has(refString)) {
      continue;
    }
    
    result.add(resource);
    processedRefs.add(refString);

    // Find all references in the resource
    const references = findReferences(resource);
    
    // Resolve each reference
    for (const ref of references) {
      if (ref.reference && !processedRefs.has(ref.reference)) {
        try {
          const [resourceType, id] = ref.reference.split('/');
          const referencedResource = await repo.readResource(resourceType as ResourceType, id);
          toProcess.push(referencedResource);
        } catch (error) {
          // Skip references that can't be resolved
          console.warn('Failed to resolve reference:', ref.reference);
        }
      }
    }
  }

  return Array.from(result);
}
