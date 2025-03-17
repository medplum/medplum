import { badRequest, normalizeErrorString, WithId } from '@medplum/core';
import { Agent, Bundle, BundleEntry, OperationDefinition, OperationOutcome, Parameters } from '@medplum/fhirtypes';
import { AgentConnectionState, AgentInfo } from '../../agent/utils';
import { getRedis } from '../../redis';
import { operation as statusOperation } from './agentstatus';
import { makeResultWrapperEntry } from './utils/agentutils';
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
 * Gets the status for a given list of Agents.
 * @param agents - The agents to get the status of.
 * @returns A Bundle containing Parameters containing agents with their corresponding status response.
 */
export async function getStatusForAgents(agents: WithId<Agent>[]): Promise<Bundle> {
  const outBundle = {
    resourceType: 'Bundle',
    type: 'collection',
    entry: [] as BundleEntry<Parameters>[],
  } satisfies Bundle;

  // Get the agent status details from Redis
  // This is set by the agent websocket connection
  // See: packages/server/src/agent/websockets.ts
  // Here we use MGET to get all the keys at once, which reduces this from O(n) Redis commands to O(1)
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

  return outBundle;
}
