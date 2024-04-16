import { allOk, badRequest, isOk, serverError } from '@medplum/core';
import { FhirRequest, FhirResponse } from '@medplum/fhir-router';
import { Bundle, BundleEntry, OperationDefinition, OperationOutcome, Parameters } from '@medplum/fhirtypes';
import { getAuthenticatedContext } from '../../context';
import { agentStatusHandler } from './agentstatus';
import { getAgentsForRequest } from './agentutils';

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
 * @param req - The FHIR request.
 * @returns The FHIR response.
 */
export async function agentBulkStatusHandler(req: FhirRequest): Promise<FhirResponse> {
  const { repo } = getAuthenticatedContext();
  const agents = await getAgentsForRequest(req, repo);
  if (!agents?.length) {
    return [badRequest('No agent(s) for given query')];
  }

  // TODO: Deal with param in body
  const promises = agents.map((agent) => agentStatusHandler({ ...req, params: { id: agent.id as string } }));
  const results = await Promise.allSettled(promises);
  const entries = [] as BundleEntry<Parameters | OperationOutcome>[];
  for (const result of results) {
    if (result.status === 'rejected') {
      entries.push({ resource: serverError(result.reason as Error) });
    } else {
      const [outcome, params] = result.value;
      if (!isOk(outcome)) {
        entries.push({ resource: outcome });
      } else {
        entries.push({ resource: params as Parameters });
      }
    }
  }

  return [
    allOk,
    {
      resourceType: 'Bundle',
      type: 'collection',
      entry: entries,
    } satisfies Bundle<Parameters | OperationOutcome>,
  ];
}
