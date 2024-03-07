import { allOk, badRequest } from '@medplum/core';
import { OperationDefinition } from '@medplum/fhirtypes';
import { Request, Response } from 'express';
import { asyncWrap } from '../../async';
import { getAuthenticatedContext } from '../../context';
import { sendOutcome } from '../outcomes';
import { getAgentForRequest } from './agentutils';
import { sendOutputParameters } from './utils/parameters';
import { getRedis } from '../../redis';

interface AgentStatusOutput {
  status: string;
  lastUpdated?: string;
}

const operation: OperationDefinition = {
  resourceType: 'OperationDefinition',
  name: 'agent-status',
  status: 'active',
  kind: 'operation',
  code: 'status',
  experimental: true,
  resource: ['Agent'],
  system: false,
  type: true,
  instance: false,
  parameter: [
    { use: 'out', name: 'status', type: 'code', min: 1, max: '1' },
    { use: 'out', name: 'lastUpdated', type: 'instant', min: 0, max: '1' },
  ],
};

/**
 * Handles HTTP requests for the Agent $status operation.
 * First reads the agent and makes sure it is valid and the user has access to it.
 * Then tries to get the agent status from Redis.
 * Returns the agent status details as a Parameters resource.
 */
export const agentStatusHandler = asyncWrap(async (req: Request, res: Response) => {
  const { repo } = getAuthenticatedContext();

  // Read the agent as the user to verify access
  const agent = await getAgentForRequest(req, repo);
  if (!agent) {
    sendOutcome(res, badRequest('Must specify agent ID or identifier'));
    return;
  }

  let output: AgentStatusOutput;

  // Get the agent status details from Redis
  // This is set by the agent websocket connection
  // See: packages/server/src/agent/websockets.ts
  const statusStr = await getRedis().get(`medplum:agent:${agent.id}:status`);
  if (statusStr) {
    output = JSON.parse(statusStr);
  } else {
    output = { status: 'unknown' };
  }

  await sendOutputParameters(req, res, operation, allOk, output);
});
