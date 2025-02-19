import { allOk, badRequest } from '@medplum/core';
import { FhirRequest, FhirResponse } from '@medplum/fhir-router';
import { Patient } from '@medplum/fhirtypes';
import { getAuthenticatedContext } from '../../context';
import { getPatientEverything } from './patienteverything';

/**
 * Handles the Patient $update-account operation.
 * This operation updates the account reference for all resources in the patient compartment.
 * The operation only updates resources from the getPatientEverything bundle that are not 
 * included in the patient's compartment, but are linked to the patient through a reference.
 * 
 * Note: the operation is currently capped at 1000 resources in the patient's compartment.
 * @param req - The FHIR request.
 * @returns The FHIR response.
 */
export async function patientUpdateAccountHandler(req: FhirRequest): Promise<FhirResponse> {
  const { id } = req.params;
  if (!id) {
    return [badRequest('Must specify Patient ID')];
  }

  const ctx = getAuthenticatedContext();
  try {
    const patient = await ctx.repo.readResource<Patient>('Patient', id);
    const bundle = await getPatientEverything(ctx.repo, patient);

    // Update each resource to trigger meta.accounts refresh
    let count = 0;
    for (const entry of bundle.entry ?? []) {
      if (entry.search?.mode === 'match') {
        const resource = entry.resource;
        if (resource && resource.id !== patient.id) {
          if (patient.meta?.accounts !== resource.meta?.accounts) {
            //prevent resource from overwriting the patient compartment with its own pre-existing accounts
            delete resource.meta?.accounts;
            delete resource.meta?.account;
          }
          await ctx.repo.updateResource(resource);
          count++;
        }
      }
    }

    return [allOk, { resourceType: 'Parameters', parameter: [{ name: 'resourcesUpdated', valueInteger: count }] }];
  } catch (error) {
    return [badRequest('Error updating patient compartment resources: ' + (error instanceof Error ? error.message : String(error)))];
  }
}
