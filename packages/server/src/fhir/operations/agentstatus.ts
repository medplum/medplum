import { allOk, badRequest, isOperationOutcome } from '@medplum/core';
import { FhirRequest, FhirResponse } from '@medplum/fhir-router';
import { OperationDefinition, OperationOutcome, Parameters } from '@medplum/fhirtypes';
import assert from 'node:assert';
import { getAuthenticatedContext } from '../../context';
import { getStatusForAgents } from './agentbulkstatus';
import { getAgentsForRequest, isSingleAgentRequest } from './utils/agentutils';

export const operation: OperationDefinition = {
  resourceType: 'OperationDefinition',
  name: 'agent-status',
  status: 'active',
  kind: 'operation',
  code: 'status',
  experimental: true,
  resource: ['Agent'],
  system: false,
  type: false,
  instance: true,
  parameter: [
    { use: 'out', name: 'status', type: 'code', min: 1, max: '1' },
    { use: 'out', name: 'version', type: 'string', min: 1, max: '1' },
    { use: 'out', name: 'lastUpdated', type: 'instant', min: 0, max: '1' },
  ],
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
export async function agentStatusHandler(req: FhirRequest): Promise<FhirResponse> {
  const { repo } = getAuthenticatedContext();

  const agents = await getAgentsForRequest(req, repo);
  if (!agents) {
    return [badRequest('Must specify agent ID, identifier, or a valid search')];
  }

  const outputBundle = await getStatusForAgents(agents);

  if (isSingleAgentRequest(req)) {
    assert(outputBundle?.entry?.length === 1);
    const parameters = outputBundle?.entry?.[0]?.resource as Parameters;
    const result = parameters.parameter?.find((param) => param.name === 'result')?.resource as
      | OperationOutcome
      | Parameters;
    if (isOperationOutcome(result)) {
      return [result];
    }
    return [allOk, result];
  }

  return [allOk, outputBundle];
}
