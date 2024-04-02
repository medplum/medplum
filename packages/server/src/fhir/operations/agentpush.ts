import { AgentTransmitRequest, allOk, badRequest, BaseAgentRequestMessage, getReferenceString } from '@medplum/core';
import { Agent } from '@medplum/fhirtypes';
import { Request, Response } from 'express';
import { randomUUID } from 'node:crypto';
import { asyncWrap } from '../../async';
import { getAuthenticatedContext } from '../../context';
import { getRedis } from '../../redis';
import { sendOutcome } from '../outcomes';
import { getAgentForRequest, getDevice } from './agentutils';
import { parseParameters } from './utils/parameters';

export interface AgentPushParameters {
  body: string;
  contentType: string;
  destination: string;
  waitForResponse?: boolean;
  waitTimeout?: number;
}

const DEFAULT_WAIT_TIMEOUT = 10000;
const MAX_WAIT_TIMEOUT = 60000;

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

  const params = parseParameters<AgentPushParameters>(req.body);
  if (!params.body) {
    sendOutcome(res, badRequest('Missing body parameter'));
    return;
  }

  if (!params.contentType) {
    sendOutcome(res, badRequest('Missing contentType parameter'));
    return;
  }

  if (!params.destination) {
    sendOutcome(res, badRequest('Missing destination parameter'));
    return;
  }

  const waitTimeout = params.waitTimeout ?? DEFAULT_WAIT_TIMEOUT;
  if (waitTimeout < 0 || waitTimeout > MAX_WAIT_TIMEOUT) {
    sendOutcome(res, badRequest('Invalid wait timeout'));
    return;
  }

  const device = await getDevice(repo, params.destination);
  if (!device) {
    sendOutcome(res, badRequest('Destination device not found'));
    return;
  }

  if (!device.url) {
    sendOutcome(res, badRequest('Destination device missing url'));
    return;
  }

  const message: AgentTransmitRequest = {
    type: 'agent:transmit:request',
    remote: device.url,
    contentType: params.contentType,
    body: params.body,
  };

  // If not waiting for a response, publish and return
  if (!params.waitForResponse) {
    await publishMessage(agent, message);
    sendOutcome(res, allOk);
    return;
  }

  // Otherwise, open a new redis connection in "subscribe" state
  message.callback = getReferenceString(agent) + '-' + randomUUID();

  const redisSubscriber = getRedis().duplicate();
  await redisSubscriber.subscribe(message.callback);
  redisSubscriber.on('message', (_channel: string, message: string) => {
    const response = JSON.parse(message);
    res.status(200).type(response.contentType).send(response.body);
    cleanup();
  });

  // Create a timer for 5 seconds for timeout
  const timer = setTimeout(() => {
    cleanup();
    sendOutcome(res, badRequest('Timeout'));
  }, waitTimeout);

  function cleanup(): void {
    redisSubscriber.disconnect();
    clearTimeout(timer);
  }

  // Publish the message to the agent channel
  await publishMessage(agent, message);

  // At this point, one of two things will happen:
  // 1. The agent will respond with a message on the channel
  // 2. The timer will expire and the request will timeout
});

async function publishMessage(agent: Agent, message: BaseAgentRequestMessage): Promise<number> {
  return getRedis().publish(getReferenceString(agent), JSON.stringify(message));
}
