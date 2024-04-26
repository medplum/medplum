import {
  AgentTransmitRequest,
  AgentTransmitResponse,
  allOk,
  badRequest,
  BaseAgentRequestMessage,
  getReferenceString,
  serverError,
} from '@medplum/core';
import { Agent, OperationOutcome, Parameters } from '@medplum/fhirtypes';
import { Request, Response } from 'express';
import { randomUUID } from 'node:crypto';
import { asyncWrap } from '../../async';
import { getAuthenticatedContext } from '../../context';
import { getRedis, getRedisSubscriber } from '../../redis';
import { sendOutcome } from '../outcomes';
import { getAgentForRequest, getDevice } from './agentutils';
import { sendAsyncResponse } from './utils/asyncjobexecutor';
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
  if (req.header('Prefer') === 'respond-async') {
    await sendAsyncResponse(req, res, async () => {
      return new Promise<Parameters>((resolve, reject) => {
        pushToAgent(req, res, (outcome, agentResponse) => {
          resolve({
            resourceType: 'Parameters',
            parameter: [
              { name: 'outcome', resource: outcome },
              ...(agentResponse ? [{ name: 'responseBody', valueString: agentResponse.body }] : []),
            ],
          } satisfies Parameters);
        }).catch(reject);
      });
    });
  } else {
    await pushToAgent(req, res, (outcome, agentResponse) => {
      if (!agentResponse) {
        sendOutcome(res, outcome);
        return;
      }
      res
        .status(agentResponse.statusCode ?? 200)
        .type(agentResponse.contentType)
        .send(agentResponse.body);
    });
  }
});

async function pushToAgent(
  req: Request,
  res: Response,
  sendResponse: (outcome: OperationOutcome, agentResponse?: AgentTransmitResponse) => void
): Promise<void> {
  const { repo } = getAuthenticatedContext();

  // Read the agent as the user to verify access
  const agent = await getAgentForRequest(req, repo);
  if (!agent) {
    sendResponse(badRequest('Must specify agent ID or identifier'));
    return;
  }

  const params = parseParameters<AgentPushParameters>(req.body);
  if (!params.body) {
    sendResponse(badRequest('Missing body parameter'));
    return;
  }

  if (!params.contentType) {
    sendResponse(badRequest('Missing contentType parameter'));
    return;
  }

  if (!params.destination) {
    sendResponse(badRequest('Missing destination parameter'));
    return;
  }

  const waitTimeout = params.waitTimeout ?? DEFAULT_WAIT_TIMEOUT;
  if (waitTimeout < 0 || waitTimeout > MAX_WAIT_TIMEOUT) {
    sendResponse(badRequest('Invalid wait timeout'));
    return;
  }

  const device = await getDevice(repo, params);
  if (!device) {
    sendResponse(badRequest('Destination device not found'));
    return;
  }

  if (!device.url) {
    sendResponse(badRequest('Destination device missing url'));
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
    sendResponse(allOk);
    return;
  }

  // Otherwise, open a new redis connection in "subscribe" state
  message.callback = getReferenceString(agent) + '-' + randomUUID();

  const redisSubscriber = getRedisSubscriber();
  await redisSubscriber.subscribe(message.callback);
  redisSubscriber.on('message', (_channel: string, message: string) => {
    const response = JSON.parse(message) as AgentTransmitResponse;
    if (response.statusCode && response.statusCode >= 400) {
      sendResponse(serverError(new Error(response.body)));
    } else {
      sendResponse(allOk, response);
    }
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
}

async function publishMessage(agent: Agent, message: BaseAgentRequestMessage): Promise<number> {
  return getRedis().publish(getReferenceString(agent), JSON.stringify(message));
}
