// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import type { AgentStatsResponse, WithId } from '@medplum/core';
import type { FhirRequest, FhirResponse } from '@medplum/fhir-router';
import type { Agent, OperationDefinition } from '@medplum/fhirtypes';
import { handleBulkAgentOperation, sendAndHandleAgentRequest } from './utils/agentutils';

export const operation: OperationDefinition = {
  resourceType: 'OperationDefinition',
  name: 'agent-stats',
  status: 'active',
  kind: 'operation',
  code: 'stats',
  experimental: true,
  resource: ['Agent'],
  system: false,
  type: true,
  instance: true,
  parameter: [{ use: 'out', name: 'return', type: 'Parameters', min: 1, max: '1' }],
};

/**
 * Handles HTTP requests for the Agent $stats operation.
 *
 * Endpoints:
 *   [fhir base]/Agent/$stats
 *   [fhir base]/Agent/[id]/$stats
 *
 * @param req - The FHIR request.
 * @returns The FHIR response.
 */
export async function agentStatsHandler(req: FhirRequest): Promise<FhirResponse> {
  return handleBulkAgentOperation(req, async (agent) => getStats(agent));
}

async function getStats(agent: WithId<Agent>): Promise<FhirResponse> {
  return sendAndHandleAgentRequest<AgentStatsResponse>(
    agent,
    { type: 'agent:stats:request' },
    'agent:stats:response',
    {
      successHandler: (response) => {
        return {
          resourceType: 'Parameters',
          parameter: [
            {
              name: 'stats',
              valueString: JSON.stringify(response.stats),
            },
          ],
        };
      },
    }
  );
}
