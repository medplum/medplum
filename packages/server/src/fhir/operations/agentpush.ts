import { allOk, badRequest, getReferenceString, Operator, parseSearchDefinition } from '@medplum/core';
import { Agent, Device } from '@medplum/fhirtypes';
import { Request, Response } from 'express';
import { asyncWrap } from '../../async';
import { getAuthenticatedContext } from '../../context';
import { getRedis } from '../../redis';
import { sendOutcome } from '../outcomes';
import { Repository } from '../repo';
import { parseParameters } from './utils/parameters';

export interface AgentPushParameters {
  body: string;
  contentType: string;
  destination: string;
}

/**
 * Handles HTTP requests for the Agent $push operation.
 * First reads the agent and makes sure it is valid and the user has access to it.
 * Then pushes the message to the agent channel.
 * Returns the outcome of the agent execution.
 */
export const agentPushHandler = asyncWrap(async (req: Request, res: Response) => {
  const { repo } = getAuthenticatedContext();

  // Read the agent as the user to verify access
  const agent = await getAgentForRequest(req, repo);
  if (!agent) {
    sendOutcome(res, badRequest('Must specify agent ID or identifier'));
    return;
  }

  const message = parseParameters<AgentPushParameters>(req.body);
  if (!message.body) {
    sendOutcome(res, badRequest('Missing body parameter'));
    return;
  }

  if (!message.contentType) {
    sendOutcome(res, badRequest('Missing contentType parameter'));
    return;
  }

  if (!message.destination) {
    sendOutcome(res, badRequest('Missing destination parameter'));
    return;
  }

  const device = await getDevice(repo, message.destination);
  if (!device) {
    sendOutcome(res, badRequest('Destination device not found'));
    return;
  }

  if (!device.url) {
    sendOutcome(res, badRequest('Destination device missing url'));
    return;
  }

  await getRedis().publish(getReferenceString(agent), JSON.stringify({ type: 'push', remote: device.url, ...message }));
  sendOutcome(res, allOk);
});

/**
 * Returns the Agent for the execute request.
 * If using "/Agent/:id/$execute", then the agent ID is read from the path parameter.
 * If using "/Agent/$execute?identifier=...", then the agent is searched by identifier.
 * Otherwise, returns undefined.
 * @param req - The HTTP request.
 * @param repo - The repository.
 * @returns The agent, or undefined if not found.
 */
async function getAgentForRequest(req: Request, repo: Repository): Promise<Agent | undefined> {
  // Prefer to search by ID from path parameter
  const { id } = req.params;
  if (id) {
    return repo.readResource<Agent>('Agent', id);
  }

  // Otherwise, search by identifier
  const { identifier } = req.query;
  if (identifier && typeof identifier === 'string') {
    return repo.searchOne<Agent>({
      resourceType: 'Agent',
      filters: [{ code: 'identifier', operator: Operator.EXACT, value: identifier }],
    });
  }

  // If no agent ID or identifier, return undefined
  return undefined;
}

async function getDevice(repo: Repository, destination: string): Promise<Device | undefined> {
  if (destination.startsWith('Device/')) {
    try {
      return await repo.readReference<Device>({ reference: destination });
    } catch (err) {
      return undefined;
    }
  }
  if (destination.startsWith('Device?')) {
    return repo.searchOne<Device>(parseSearchDefinition(destination));
  }
  return undefined;
}
