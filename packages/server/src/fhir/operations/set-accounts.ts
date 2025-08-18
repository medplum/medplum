// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { AccessPolicyInteraction, allOk, append, badRequest, forbidden, isResourceType, notFound } from '@medplum/core';
import { FhirRequest, FhirResponse } from '@medplum/fhir-router';
import { OperationDefinition, Reference, ResourceType } from '@medplum/fhirtypes';
import { getAuthenticatedContext } from '../../context';
import { getSystemRepo } from '../repo';
import { searchPatientCompartment } from './patienteverything';
import { buildOutputParameters, parseInputParameters } from './utils/parameters';

const operation: OperationDefinition = {
  resourceType: 'OperationDefinition',
  id: 'set-accounts',
  name: 'SetAccounts',
  status: 'active',
  kind: 'operation',
  code: 'set-accounts',
  description: `Updates account references for the target resource, and optionally any resources in the target's FHIR compartment`,
  resource: ['Resource' as ResourceType],
  system: false,
  type: false,
  instance: true,
  parameter: [
    {
      use: 'in',
      name: 'accounts',
      documentation: 'List of account references to set',
      type: 'Reference',
      min: 0,
      max: '*',
    },
    {
      use: 'in',
      name: 'propagate',
      documentation: 'If set, also push changes to other resources in the compartment of the target resource',
      type: 'boolean',
      min: 0,
      max: '1',
    },
    {
      use: 'out',
      name: 'resourcesUpdated',
      documentation: 'Number of resources that were updated',
      type: 'integer',
      min: 1,
      max: '1',
    },
  ],
};

export interface SetAccountsParameters {
  accounts: Reference[];
  propagate?: boolean;
}

/**
 * Handles the $set-accounts operation.
 * This operation updates the account reference for  a resource, and optionally
 * all resources in the target compartment as well.
 *
 * NOTE: the operation is currently capped at 1000 resources in the patient compartment.
 * @param req - The FHIR request.
 * @returns The FHIR response.
 */
export async function setAccountsHandler(req: FhirRequest): Promise<FhirResponse> {
  const { id, resourceType } = req.params;
  if (!id || !resourceType) {
    return [badRequest('Must specify resource type and ID')];
  }

  if (!isResourceType(resourceType)) {
    return [badRequest('Invalid resource type')];
  }

  const params = parseInputParameters<SetAccountsParameters>(operation, req);
  const { repo } = getAuthenticatedContext();
  const systemRepo = getSystemRepo();

  const isSuperAdmin = repo.isSuperAdmin();
  if (!repo.isProjectAdmin() && !isSuperAdmin) {
    return [forbidden];
  }

  // Use system repo to read the resource, ensuring we get access to the full `meta.accounts`
  const target = await systemRepo.readResource(resourceType, id);
  // Ensure user's repo can read this resource as well
  if (!repo.canPerformInteraction(AccessPolicyInteraction.READ, target)) {
    return [notFound];
  }
  const accounts = params.accounts;
  const oldAccounts = target.meta?.accounts;

  // Update the target resource with the new accounts
  target.meta = {
    ...target.meta,
    accounts: accounts,
    account: accounts?.[0],
  };
  await repo.updateResource(target);
  let count = 1; // Target resource is updated already

  if (params.propagate && target.resourceType === 'Patient') {
    // Calculate the difference between the previous accounts array and new one, in order to
    // propagate only those changes to compartment resources
    const additions = accounts.filter((a) => !oldAccounts?.find((o) => o.reference === a.reference));
    const removals = oldAccounts?.filter((o) => !accounts.find((a) => a.reference === o.reference)) ?? [];

    // Update the resources in the target compartment to trigger meta.accounts refresh
    const bundle = await searchPatientCompartment(repo, target);
    for (const entry of bundle.entry ?? []) {
      const resource = entry.resource;
      if (resource && resource.resourceType !== 'Patient') {
        let accountList = resource.meta?.accounts;
        for (const added of additions) {
          if (!accountList?.find((a) => a.reference === added.reference)) {
            accountList = append(accountList, added);
          }
        }
        for (const dropped of removals) {
          const index = accountList?.findIndex((a) => a.reference === dropped.reference) ?? -1;
          if (index > -1) {
            accountList?.splice(index, 1);
          }
        }

        resource.meta = {
          ...resource.meta,
          accounts: accountList,
          account: accountList?.[0],
        };
        // Use system repo to force update meta.accounts
        await systemRepo.updateResource(resource);
        count++;
      }
    }
  }

  return [allOk, buildOutputParameters(operation, { resourcesUpdated: count })];
}
