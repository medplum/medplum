import { allOk, getReferenceString, Operator, SearchRequest } from '@medplum/core';
import { FhirRequest, FhirResponse } from '@medplum/fhir-router';
import {
  Bundle,
  BundleEntry,
  CompartmentDefinitionResource,
  Patient,
  Resource,
  ResourceType,
} from '@medplum/fhirtypes';
import { getAuthenticatedContext } from '../../context';
import { getPatientCompartments } from '../patient';
import { Repository } from '../repo';
import { getFullUrl } from '../response';
import { getOperationDefinition } from './definitions';
import { parseInputParameters } from './utils/parameters';

const operation = getOperationDefinition('Patient', 'everything');

type PatientEverythingParameters = {
  _since?: string;
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
  const patientRef = getReferenceString(patient);
  const resourceList = getPatientCompartments().resource as CompartmentDefinitionResource[];
  const searches: SearchRequest[] = [];

  // Build a list of filters to apply to the searches
  const filters = [];
  if (params?._since) {
    filters.push({
      code: '_lastUpdated',
      operator: Operator.GREATER_THAN_OR_EQUALS,
      value: params._since,
    });
  }

  // Build a list of searches
  for (const resource of resourceList) {
    const searchParams = resource.param;
    if (!searchParams) {
      continue;
    }
    for (const code of searchParams) {
      searches.push({
        resourceType: resource.code as ResourceType,
        count: 1000,
        filters: [
          {
            code,
            operator: Operator.EQUALS,
            value: patientRef,
          },
          ...filters,
        ],
      });
    }
  }

  // Execute all of the searches in parallel
  // Some day we could do this in a single SQL query
  const promises = searches.map((searchRequest) => repo.search(searchRequest));
  const searchResults = await Promise.all(promises);

  // Build the result bundle
  const entry: BundleEntry[] = [];

  if (!params?._since || (patient.meta?.lastUpdated as string) >= params?._since) {
    entry.push({
      fullUrl: getFullUrl('Patient', patient.id as string),
      resource: patient,
    });
  }

  const resourceSet = new Set<string>([getReferenceString(patient)]);
  for (const searchResult of searchResults) {
    if (searchResult.entry) {
      for (const e of searchResult.entry) {
        const resourceRef = getReferenceString(e.resource as Resource);
        if (!resourceSet.has(resourceRef)) {
          resourceSet.add(resourceRef);
          entry.push(e);
        }
      }
    }
  }

  return {
    resourceType: 'Bundle',
    type: 'searchset',
    entry,
  };
}
