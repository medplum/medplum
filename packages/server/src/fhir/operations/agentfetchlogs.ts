// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import type { AgentLogsResponse, WithId } from '@medplum/core';
import type { FhirRequest, FhirResponse } from '@medplum/fhir-router';
import type { Agent, OperationDefinition } from '@medplum/fhirtypes';
import type { Repository } from '../repo';
import { handleBulkAgentOperation, sendAndHandleAgentRequest } from './utils/agentutils';
import { parseInputParameters } from './utils/parameters';

export const operation: OperationDefinition = {
  resourceType: 'OperationDefinition',
  name: 'agent-fetch-logs',
  status: 'active',
  kind: 'operation',
  code: 'fetch-logs',
  experimental: true,
  resource: ['Agent'],
  system: false,
  type: true,
  instance: true,
  parameter: [
    { use: 'in', name: 'limit', type: 'integer', min: 0, max: '1' },
    { use: 'out', name: 'return', type: 'Parameters', min: 1, max: '1' },
  ],
};

/**
 * Handles HTTP requests for the Agent $fetch-logs operation.
 *
 * Endpoints:
 *   [fhir base]/Agent/$fetch-logs
 *   [fhir base]/Agent/[id]/$fetch-logs
 *
 * @param req - The FHIR request.
 * @returns The FHIR response.
 */
export async function agentFetchLogsHandler(req: FhirRequest): Promise<FhirResponse> {
  const { limit: _limit, ...rest } = req.query;
  const params = parseInputParameters<AgentFetchLogsOptions>(operation, req);
  req.query = rest;

  return handleBulkAgentOperation(req, async (repo, agent) => fetchLogs(repo, agent, params));
}

export type AgentFetchLogsOptions = {
  limit?: number;
};

async function fetchLogs(
  repo: Repository,
  agent: WithId<Agent>,
  options: AgentFetchLogsOptions
): Promise<FhirResponse> {
  return sendAndHandleAgentRequest<AgentLogsResponse>(
    repo,
    agent,
    { type: 'agent:logs:request', limit: options?.limit },
    'agent:logs:response',
    {
      successHandler: (response) => {
        return {
          resourceType: 'Parameters',
          parameter: [
            {
              name: 'logs',
              valueString: response.logs.map((msg) => JSON.stringify(msg)).join('\n'),
            },
          ],
        };
      },
    }
  );
}
