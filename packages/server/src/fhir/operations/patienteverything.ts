import { allOk, getReferenceString, Operator, SearchRequest } from '@medplum/core';
import {
  Bundle,
  BundleEntry,
  CompartmentDefinitionResource,
  Patient,
  Resource,
  ResourceType,
} from '@medplum/fhirtypes';
import { Request, Response } from 'express';
import { getConfig } from '../../config';
import { getPatientCompartments } from '../patient';
import { Repository } from '../repo';
import { sendResponse } from '../routes';
import { getAuthenticatedContext } from '../../context';

// Patient everything operation.
// https://hl7.org/fhir/operation-patient-everything.html

/**
 * Handles a Patient everything request.
 * Searches for all resources related to the patient.
 * @param req The HTTP request.
 * @param res The HTTP response.
 */
export async function patientEverythingHandler(req: Request, res: Response): Promise<void> {
  const ctx = getAuthenticatedContext();
  const { id } = req.params;

  // First read the patient to verify access
  const patient = await ctx.repo.readResource<Patient>('Patient', id);

  // Then read all of the patient data
  const bundle = await getPatientEverything(ctx.repo, patient);

  await sendResponse(res, allOk, bundle);
}

/**
 * Executes the Patient $everything operation.
 * Searches for all resources related to the patient.
 * @param repo The repository.
 * @param patient The root patient.
 * @returns The patient everything search result bundle.
 */
export async function getPatientEverything(repo: Repository, patient: Patient): Promise<Bundle> {
  const patientRef = getReferenceString(patient);
  const resourceList = getPatientCompartments().resource as CompartmentDefinitionResource[];
  const searches: SearchRequest[] = [];

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
        ],
      });
    }
  }

  // Execute all of the searches in parallel
  // Some day we could do this in a single SQL query
  const promises = searches.map((searchRequest) => repo.search(searchRequest));
  const searchResults = await Promise.all(promises);

  // Build the result bundle
  const entry: BundleEntry[] = [
    {
      fullUrl: `${getConfig().baseUrl}fhir/R4/Patient/${patient.id}`,
      resource: patient,
    },
  ];
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
