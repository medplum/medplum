// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { allOk, badRequest } from '@medplum/core';
import { FhirRequest, FhirResponse } from '@medplum/fhir-router';
import { Bundle, OperationDefinition } from '@medplum/fhirtypes';
import { getAuthenticatedContext } from '../../context';
import { getStatusForAgents } from './agentstatus';
import { getAgentsForRequest, makeResultWrapperEntry } from './utils/agentutils';

export const operation: OperationDefinition = {
  resourceType: 'OperationDefinition',
  name: 'agent-bulk-status',
  status: 'active',
  kind: 'operation',
  code: 'bulk-status',
  experimental: true,
  resource: ['Agent'],
  system: false,
  type: true,
  instance: false,
  parameter: [{ use: 'out', name: 'return', type: 'Bundle', min: 1, max: '1' }],
};

/**
 * Handles HTTP requests for the Agent $status operation.
 * First reads the agent and makes sure it is valid and the user has access to it.
 * Then tries to get the agent status from Redis.
 * Returns the agent status details as a Parameters resource.
 *
 * Endpoint
 *   [fhir base]/Agent/$bulk-status
 *
 * @param req - The FHIR request.
 * @returns The FHIR response.
 */
export async function agentBulkStatusHandler(req: FhirRequest): Promise<FhirResponse> {
  const { repo } = getAuthenticatedContext();

  const agents = await getAgentsForRequest(req, repo);
  if (!agents?.length) {
    return [badRequest('No agent(s) for given query')];
  }

  const statuses = await getStatusForAgents(agents);

  const outBundle = {
    resourceType: 'Bundle',
    type: 'collection',
    entry: statuses.map((statusOrOutcome, i) => makeResultWrapperEntry(statusOrOutcome, agents[i])),
  } satisfies Bundle;

  return [allOk, outBundle];
}
