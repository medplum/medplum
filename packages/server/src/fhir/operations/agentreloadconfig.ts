// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import type { WithId } from '@medplum/core';
import type { FhirRequest, FhirResponse } from '@medplum/fhir-router';
import type { Agent } from '@medplum/fhirtypes';
import { makeOperationDefinition } from './definitions';
import { handleBulkAgentOperation, sendAndHandleAgentRequest } from './utils/agentutils';

export const operation = makeOperationDefinition(
  { scope: 'type-and-instance', resource: 'Agent' },
  {
    name: 'agent-reload-config',
    code: 'reload-config',
    parameter: [{ use: 'out', name: 'return', type: 'Bundle', min: 1, max: '1' }],
  }
);

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
  return handleBulkAgentOperation(req, async (agent) => reloadConfig(agent));
}

async function reloadConfig(agent: WithId<Agent>): Promise<FhirResponse> {
  return sendAndHandleAgentRequest(agent, { type: 'agent:reloadconfig:request' }, 'agent:reloadconfig:response');
}
