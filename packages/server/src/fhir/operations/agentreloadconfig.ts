import { AgentReloadConfigResponse, OperationOutcomeError, badRequest, serverError } from '@medplum/core';
import { FhirRequest, FhirResponse } from '@medplum/fhir-router';
import { Agent, OperationDefinition } from '@medplum/fhirtypes';
import { handleBulkAgentOperation, publishAgentRequest } from './utils/agentutils';

export const operation: OperationDefinition = {
  resourceType: 'OperationDefinition',
  name: 'agent-reload-config',
  status: 'active',
  kind: 'operation',
  code: 'reload-config',
  experimental: true,
  resource: ['Agent'],
  system: false,
  type: true,
  instance: true,
  parameter: [{ use: 'out', name: 'return', type: 'Bundle', min: 1, max: '1' }],
};

/**
 * Handles HTTP requests for the Agent $reload-config operation.
 *
 * Endpoints:
 *   [fhir base]/Agent/$reload-config
 *   [fhir base]/Agent/[id]/$reload-config
 *
 * @param req - The FHIR request.
 * @returns The FHIR response.
 */
export async function agentReloadConfigHandler(req: FhirRequest): Promise<FhirResponse> {
  return handleBulkAgentOperation(req, async (agent: Agent) => reloadConfig(agent));
}

async function reloadConfig(agent: Agent): Promise<FhirResponse> {
  // Send agent message
  const [outcome, result] = await publishAgentRequest<AgentReloadConfigResponse>(
    agent,
    { type: 'agent:reloadconfig:request' },
    { waitForResponse: true }
  );

  if (!result || result.type === 'agent:reloadconfig:response') {
    return [outcome];
  }

  if (result.type === 'agent:error') {
    throw new OperationOutcomeError(badRequest(result.body));
  }

  throw new OperationOutcomeError(serverError(new Error('Invalid response received from agent')));
}
