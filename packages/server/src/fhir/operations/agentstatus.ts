import { allOk, badRequest } from '@medplum/core';
import { FhirRequest, FhirResponse } from '@medplum/fhir-router';
import { OperationDefinition } from '@medplum/fhirtypes';
import { AgentConnectionState, AgentInfo } from '../../agent/utils';
import { getAuthenticatedContext } from '../../context';
import { getRedis } from '../../redis';
import { getAgentForRequest } from './utils/agentutils';
import { buildOutputParameters } from './utils/parameters';

const operation: OperationDefinition = {
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

  // Read the agent as the user to verify access
  const agent = await getAgentForRequest(req, repo);
  if (!agent) {
    return [badRequest('Must specify agent ID or identifier')];
  }

  let output: AgentInfo;

  // Get the agent status details from Redis
  // This is set by the agent websocket connection
  // See: packages/server/src/agent/websockets.ts
  const statusStr = await getRedis().get(`medplum:agent:${agent.id}:info`);
  if (statusStr) {
    output = JSON.parse(statusStr);
  } else {
    output = { status: AgentConnectionState.UNKNOWN, version: 'unknown' };
  }

  return [allOk, buildOutputParameters(operation, output)];
}
