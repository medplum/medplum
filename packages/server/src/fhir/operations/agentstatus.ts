// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { allOk, badRequest, isOperationOutcome, normalizeErrorString, WithId } from '@medplum/core';
import { FhirRequest, FhirResponse } from '@medplum/fhir-router';
import { Agent, OperationDefinition, OperationOutcome, Parameters } from '@medplum/fhirtypes';
import { AgentConnectionState, AgentInfo } from '../../agent/utils';
import { getAuthenticatedContext } from '../../context';
import { getRedis } from '../../redis';
import { getAgentForRequest } from './utils/agentutils';
import { buildOutputParameters } from './utils/parameters';

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

  // Read the agent as the user to verify access
  const agent = await getAgentForRequest(req, repo);
  if (!agent) {
    return [badRequest('Must specify agent ID or identifier')];
  }

  const [statusOrOutcome] = await getStatusForAgents([agent]);

  if (isOperationOutcome(statusOrOutcome)) {
    return [statusOrOutcome];
  }

  return [allOk, statusOrOutcome];
}

/**
 * Gets the status for a given list of Agents.
 * @param agents - The agents to get the status of.
 * @returns A Bundle containing Parameters containing agents with their corresponding status response.
 */
export async function getStatusForAgents(agents: WithId<Agent>[]): Promise<(Parameters | OperationOutcome)[]> {
  // Get the agent status details from Redis
  // This is set by the agent websocket connection
  // See: packages/server/src/agent/websockets.ts
  // Here we use MGET to get all the keys at once, which reduces this from O(n) Redis commands to O(1)
  const statusStrs = await getRedis().mget(agents.map((agent) => `medplum:agent:${agent.id}:info`));

  const statuses: (Parameters | OperationOutcome)[] = [];

  for (let i = 0; i < agents.length; i++) {
    const statusStr = statusStrs[i];
    let output: Parameters | OperationOutcome | undefined;

    if (statusStr) {
      const info: AgentInfo = JSON.parse(statusStr);
      try {
        output = buildOutputParameters(operation, info);
      } catch (err) {
        // If we catch an error here, that means we have an invalid agent info entry
        output = badRequest(`Invalid agent info: ${normalizeErrorString(err)}`);
      }
    }

    if (output) {
      statuses.push(output);
    } else {
      statuses.push(buildOutputParameters(operation, { status: AgentConnectionState.UNKNOWN, version: 'unknown' }));
    }
  }

  return statuses;
}
