import { allOk, getReferenceString, Operator, sortStringArray, WithId } from '@medplum/core';
import { FhirRequest, FhirResponse } from '@medplum/fhir-router';
import { Bundle, CompartmentDefinitionResource, Patient, Resource, ResourceType } from '@medplum/fhirtypes';
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
  patient: WithId<Patient>,
  params?: PatientEverythingParameters
): Promise<Bundle<WithId<Resource>>> {
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

  return repo.search({
    resourceType: 'Patient',
    types,
    filters,
    count: params?._count ?? defaultMaxResults,
    offset: params?._offset,
  });
}
