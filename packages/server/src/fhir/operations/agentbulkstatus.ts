import { FhirRequest, FhirResponse } from '@medplum/fhir-router';
import { Agent, OperationDefinition } from '@medplum/fhirtypes';
import { agentStatusHandler } from './agentstatus';
import { handleBulkAgentOperation } from './utils/agentutils';

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
  return handleBulkAgentOperation(req, (agent: Agent) =>
    agentStatusHandler({ ...req, params: { id: agent.id as string } })
  );
}
