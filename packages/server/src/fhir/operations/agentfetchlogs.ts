import { AgentLogResponse, OperationOutcomeError, WithId, badRequest, serverError } from '@medplum/core';
import { FhirRequest, FhirResponse } from '@medplum/fhir-router';
import { Agent, OperationDefinition } from '@medplum/fhirtypes';
import { handleBulkAgentOperation, publishAgentRequest } from './utils/agentutils';

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
    { use: 'in', name: 'count', type: 'integer', min: 0, max: '1' },
    { use: 'in', name: 'level', type: '', min: 0, max: '1' },
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
  return handleBulkAgentOperation(req, async (agent) => fetchLogs(agent));
}

async function fetchLogs(agent: WithId<Agent>): Promise<FhirResponse> {
  // Send agent message
  const [outcome, result] = await publishAgentRequest<AgentLogResponse>(
    agent,
    { type: 'agent:logs:request' },
    { waitForResponse: true }
  );

  if (!result) {
    return [outcome];
  }

  if (result.type === 'agent:logs:response') {
    return [
      outcome,
      {
        resourceType: 'Parameters',
        parameter: [
          {
            name: 'logs',
            valueString: result.logs,
          },
        ],
      },
    ];
  }

  if (result.type === 'agent:error') {
    throw new OperationOutcomeError(badRequest(result.body));
  }

  throw new OperationOutcomeError(serverError(new Error('Invalid response received from agent')));
}
