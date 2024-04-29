import { AgentSuccess, OperationOutcomeError, serverError } from '@medplum/core';
import { FhirRequest, FhirResponse } from '@medplum/fhir-router';
import { Agent, OperationDefinition, Parameters } from '@medplum/fhirtypes';
import { handleBulkAgentOperation, publishAgentMessage } from './agentutils';

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
  instance: false,
  parameter: [{ use: 'out', name: 'return', type: 'Bundle', min: 1, max: '1' }],
};

/**
 * Handles HTTP requests for the Agent $reload-config operation.
 * First reads the agent and makes sure it is valid and the user has access to it.
 * Then tries to get the agent status from Redis.
 * Returns the agent status details as a Parameters resource.
 *
 * @param req - The FHIR request.
 * @returns The FHIR response.
 */
export async function agentReloadConfigHandler(req: FhirRequest): Promise<FhirResponse> {
  return handleBulkAgentOperation(req, async (agent: Agent) => reloadConfig(agent));
}

async function reloadConfig(agent: Agent): Promise<FhirResponse> {
  // Send agent message
  const [outcome, result] = await publishAgentMessage<AgentSuccess>(
    agent,
    { type: 'agent:reloadconfig:request' },
    { waitForResponse: true }
  );

  if (!result) {
    return [outcome];
  }

  if (result.type === 'agent:error') {
    throw new OperationOutcomeError(serverError(new Error(result.body)));
  }

  return [
    outcome,
    {
      resourceType: 'Parameters',
      parameter: [{ name: 'result', valueString: JSON.stringify(result) }],
    } satisfies Parameters,
  ];
}
