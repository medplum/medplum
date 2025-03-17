import { allOk, badRequest, normalizeErrorString } from '@medplum/core';
import { FhirRequest, FhirResponse } from '@medplum/fhir-router';
import { Bundle, BundleEntry, OperationDefinition, OperationOutcome, Parameters } from '@medplum/fhirtypes';
import { AgentConnectionState, AgentInfo } from '../../agent/utils';
import { getAuthenticatedContext } from '../../context';
import { getRedis } from '../../redis';
import { agentStatusHandler, operation as statusOperation } from './agentstatus';
import { getAgentsForRequest, makeResultWrapperEntry } from './utils/agentutils';
import { buildOutputParameters } from './utils/parameters';

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

  if (req.params.id) {
    return agentStatusHandler({ ...req, params: { id: req.params.id } });
  }

  const agents = await getAgentsForRequest(req, repo);
  if (!agents?.length) {
    return [badRequest('No agent(s) for given query')];
  }

  const outBundle = {
    resourceType: 'Bundle',
    type: 'collection',
    entry: [] as BundleEntry<Parameters>[],
  } satisfies Bundle;

  // Get the agent status details from Redis
  // This is set by the agent websocket connection
  // See: packages/server/src/agent/websockets.ts
  // Here we use MGET to get all the keys at once, which reduces this from O(n) operations to O(1)
  const statusStrs = await getRedis().mget(agents.map((agent) => `medplum:agent:${agent.id}:info`));

  for (let i = 0; i < agents.length; i++) {
    const statusStr = statusStrs[i];
    let output: Parameters | OperationOutcome | undefined;

    if (statusStr) {
      const info: AgentInfo = JSON.parse(statusStr);
      try {
        output = buildOutputParameters(statusOperation, info);
      } catch (err) {
        // If we catch an error here, that means we have an invalid agent info entry
        output = badRequest(`Invalid agent info: ${normalizeErrorString(err)}`);
      }
    }

    if (output) {
      outBundle.entry.push(makeResultWrapperEntry(output, agents[i]));
    } else {
      outBundle.entry.push(
        makeResultWrapperEntry(
          buildOutputParameters(statusOperation, { status: AgentConnectionState.UNKNOWN, version: 'unknown' }),
          agents[i]
        )
      );
    }
  }

  return [allOk, outBundle];
}
