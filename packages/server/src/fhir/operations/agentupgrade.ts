import { AgentUpgradeResponse, OperationOutcomeError, badRequest, serverError } from '@medplum/core';
import { FhirRequest, FhirResponse } from '@medplum/fhir-router';
import { Agent, OperationDefinition } from '@medplum/fhirtypes';
import { handleBulkAgentOperation, publishAgentRequest } from './utils/agentutils';

export const operation: OperationDefinition = {
  resourceType: 'OperationDefinition',
  name: 'agent-upgrade',
  status: 'active',
  kind: 'operation',
  code: 'upgrade',
  experimental: true,
  resource: ['Agent'],
  system: false,
  type: true,
  instance: true,
  parameter: [{ use: 'out', name: 'return', type: 'Bundle', min: 1, max: '1' }],
};

/**
 * Handles HTTP requests for the Agent $upgrade operation.
 *
 * Endpoints:
 *   [fhir base]/Agent/$upgrade
 *   [fhir base]/Agent/[id]/$upgrade
 *
 * @param req - The FHIR request.
 * @returns The FHIR response.
 */
export async function agentUpgradeHandler(req: FhirRequest): Promise<FhirResponse> {
  const { version } = req.query;
  req.query.version = undefined;
  return handleBulkAgentOperation(req, async (agent: Agent) => upgradeAgent(agent, version));
}

async function upgradeAgent(agent: Agent, version?: string): Promise<FhirResponse> {
  // Send agent message
  const [outcome, result] = await publishAgentRequest<AgentUpgradeResponse>(
    agent,
    { type: 'agent:upgrade:request', ...(version ? { version } : undefined) },
    { waitForResponse: true }
  );

  if (!result || result.type === 'agent:upgrade:response') {
    return [outcome];
  }

  if (result.type === 'agent:error') {
    throw new OperationOutcomeError(badRequest(result.body));
  }

  throw new OperationOutcomeError(serverError(new Error('Invalid response received from agent')));
}
