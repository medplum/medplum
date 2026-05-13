// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import type { AgentUpgradeResponse, WithId } from '@medplum/core';
import type { FhirRequest, FhirResponse } from '@medplum/fhir-router';
import type { Agent } from '@medplum/fhirtypes';
import { makeOperationDefinition } from './definitions';
import { handleBulkAgentOperation, sendAndHandleAgentRequest } from './utils/agentutils';
import { parseInputParameters } from './utils/parameters';

const DEFAULT_UPGRADE_TIMEOUT = 45000;
const MAX_UPGRADE_TIMEOUT = 56000;

export const operation = makeOperationDefinition(
  { scope: 'type-and-instance', resource: 'Agent' },
  {
    name: 'agent-upgrade',
    code: 'upgrade',
    parameter: [
      { use: 'in', name: 'version', type: 'string', min: 0, max: '1' },
      { use: 'in', name: 'timeout', type: 'integer', min: 0, max: '1' },
      { use: 'in', name: 'force', type: 'boolean', min: 0, max: '1' },
      { use: 'out', name: 'return', type: 'Bundle', min: 1, max: '1' },
    ],
  }
);

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
  const { version: _version, timeout: _timeout, force: _force, ...rest } = req.query;
  const params = parseInputParameters<AgentUpgradeOptions>(operation, req);
  req.query = rest;

  return handleBulkAgentOperation(req, async (agent) => upgradeAgent(agent, params));
}

export type AgentUpgradeOptions = {
  version?: string;
  timeout?: number;
  force?: boolean;
};

async function upgradeAgent(agent: WithId<Agent>, options?: AgentUpgradeOptions): Promise<FhirResponse> {
  let timeout = options?.timeout ?? DEFAULT_UPGRADE_TIMEOUT;
  if (timeout > MAX_UPGRADE_TIMEOUT) {
    timeout = MAX_UPGRADE_TIMEOUT;
  }

  return sendAndHandleAgentRequest<AgentUpgradeResponse>(
    agent,
    {
      type: 'agent:upgrade:request',
      ...(options?.version ? { version: options.version } : undefined),
      ...(options?.force ? { force: true } : undefined),
    },
    'agent:upgrade:response',
    { messageOptions: { timeout } }
  );
}
