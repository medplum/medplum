import { allOk, badRequest, getReferenceString, Hl7Message, Operator } from '@medplum/core';
import { Agent } from '@medplum/fhirtypes';
import { Request, Response } from 'express';
import { asyncWrap } from '../../async';
import { getAuthenticatedContext } from '../../context';
import { getRedis } from '../../redis';
import { sendOutcome } from '../outcomes';

/**
 * Handles HTTP requests for the Agent $push operation.
 * First reads the agent and makes sure it is valid and the user has access to it.
 * Then pushes the message to the agent channel.
 * Returns the outcome of the agent execution.
 */
export const agentPushHandler = asyncWrap(async (req: Request, res: Response) => {
  // Read the agent as the user to verify access
  const agent = await getAgentForRequest(req);
  if (!agent) {
    sendOutcome(res, badRequest('Must specify agent ID or identifier.'));
    return;
  }

  const channel = getReferenceString(agent);
  const input = req.method === 'POST' ? req.body : req.query;
  const data = input instanceof Hl7Message ? input.toString() : input;

  // Publish the message to the agent channel
  await getRedis().publish(channel, data);

  sendOutcome(res, allOk);
});

/**
 * Returns the Agent for the execute request.
 * If using "/Agent/:id/$execute", then the agent ID is read from the path parameter.
 * If using "/Agent/$execute?identifier=...", then the agent is searched by identifier.
 * Otherwise, returns undefined.
 * @param req The HTTP request.
 * @returns The agent, or undefined if not found.
 */
async function getAgentForRequest(req: Request): Promise<Agent | undefined> {
  const ctx = getAuthenticatedContext();

  // Prefer to search by ID from path parameter
  const { id } = req.params;
  if (id) {
    return ctx.repo.readResource<Agent>('Agent', id);
  }

  // Otherwise, search by identifier
  const { identifier } = req.query;
  if (identifier && typeof identifier === 'string') {
    return ctx.repo.searchOne<Agent>({
      resourceType: 'Agent',
      filters: [{ code: 'identifier', operator: Operator.EXACT, value: identifier }],
    });
  }

  // If no agent ID or identifier, return undefined
  return undefined;
}
