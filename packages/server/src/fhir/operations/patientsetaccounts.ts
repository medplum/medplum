// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { allOk, badRequest, forbidden } from '@medplum/core';
import { FhirRequest, FhirResponse } from '@medplum/fhir-router';
import { OperationDefinition, Patient, Reference } from '@medplum/fhirtypes';
import { getAuthenticatedContext } from '../../context';
import { getPatientEverything } from './patienteverything';
import { buildOutputParameters, parseInputParameters } from './utils/parameters';

const operation: OperationDefinition = {
  resourceType: 'OperationDefinition',
  id: 'patient-set-accounts',
  name: 'SetAccounts',
  status: 'active',
  kind: 'operation',
  code: 'set-accounts',
  description: "Updates account references for all resources in the patient's compartment",
  resource: ['Patient'],
  system: false,
  type: false,
  instance: true,
  parameter: [
    {
      // Input parameter for the accounts array
      use: 'in',
      name: 'accounts',
      type: 'Reference',
      min: 0,
      max: '*',
      documentation: 'List of account references to set',
    },
    {
      // Output parameter for number of resources updated
      use: 'out',
      name: 'resourcesUpdated',
      type: 'integer',
      min: 1,
      max: '1',
      documentation: 'Number of resources that were updated',
    },
  ],
};

export interface PatientSetAccountsParameters {
  accounts: Reference[];
}

/**
 * Handles the Patient $set-accounts operation.
 * This operation updates the account reference for all resources in the patient compartment.
 * The operation only updates resources from the getPatientEverything bundle that are not
 * included in the patient's compartment, but are linked to the patient through a reference.
 *
 * Note: the operation is currently capped at 1000 resources in the patient's compartment.
 * @param req - The FHIR request.
 * @returns The FHIR response.
 */
export async function patientSetAccountsHandler(req: FhirRequest): Promise<FhirResponse> {
  const { id } = req.params;
  if (!id) {
    return [badRequest('Must specify Patient ID')];
  }

  const params = parseInputParameters<PatientSetAccountsParameters>(operation, req);
  const ctx = getAuthenticatedContext();

  const isSuperAdmin = ctx.repo.isSuperAdmin();
  if (!ctx.repo.isProjectAdmin() && !isSuperAdmin) {
    return [forbidden];
  }

  const patient = await ctx.repo.readResource<Patient>('Patient', id);
  const bundle = await getPatientEverything(ctx.repo, patient);
  const accounts = params.accounts;

  // step 1: update the patient resource with the new accounts
  patient.meta = {
    ...patient.meta,
    accounts: accounts,
    account: accounts?.[0],
  };

  await ctx.repo.updateResource(patient);

  // step 2: update the resources in the patient compartment to trigger meta.accounts refresh
  let count = 1;
  for (const entry of bundle.entry ?? []) {
    if (entry.search?.mode === 'match') {
      const resource = entry.resource;
      if (resource && resource.resourceType !== 'Patient') {
        resource.meta = {
          //persist other meta fields (ex. tag, security, etc.)
          ...resource.meta,
          accounts: undefined, //don't define here. Instead, inherit from the patient resource on update
          account: undefined,
        };

        await ctx.repo.updateResource(resource, { inheritAccounts: true });
        count++;
      }
    }
  }

  return [
    allOk,
    buildOutputParameters(operation, {
      resourcesUpdated: count,
    }),
  ];
}
