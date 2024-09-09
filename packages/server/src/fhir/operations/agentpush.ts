import {
  AgentTransmitRequest,
  AgentTransmitResponse,
  ContentType,
  OperationOutcomeError,
  badRequest,
} from '@medplum/core';
import { OperationOutcome, Parameters } from '@medplum/fhirtypes';
import { Request, Response } from 'express';
import { asyncWrap } from '../../async';
import { getAuthenticatedContext } from '../../context';
import { sendOutcome } from '../outcomes';
import { getAgentForRequest, getDevice, publishAgentRequest } from './utils/agentutils';
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
const MAX_WAIT_TIMEOUT = 55000;

/**
 * Handles HTTP requests for the Agent $push operation.
 * First reads the agent and makes sure it is valid and the user has access to it.
 * Then pushes the message to the agent channel.
 * Returns the outcome of the agent execution.
 */
export const agentPushHandler = asyncWrap(async (req: Request, res: Response) => {
  if (req.header('Prefer') === 'respond-async') {
    await sendAsyncResponse(req, res, async () => {
      const [outcome, agentResponse] = await pushToAgent(req);
      return {
        resourceType: 'Parameters',
        parameter: [
          { name: 'outcome', resource: outcome },
          ...(agentResponse ? [{ name: 'responseBody', valueString: agentResponse.body }] : []),
        ],
      } satisfies Parameters;
    });
  } else {
    const [outcome, agentResponse] = await pushToAgent(req);
    if (!agentResponse) {
      sendOutcome(res, outcome);
      return;
    }
    res
      .status(agentResponse.statusCode ?? 200)
      .type(agentResponse.contentType)
      .send(agentResponse.body);
  }
});

async function pushToAgent(req: Request): Promise<[OperationOutcome] | [OperationOutcome, AgentTransmitResponse]> {
  const { repo } = getAuthenticatedContext();

  // Read the agent as the user to verify access
  const agent = await getAgentForRequest(req, repo);
  if (!agent) {
    return [badRequest('Must specify agent ID or identifier')];
  }

  const params = parseParameters<AgentPushParameters>(req.body);

  // TODO: Clean this up later by factoring out 'ping' into it's own operation
  if (agent.status === 'off' && params.contentType !== ContentType.PING) {
    return [badRequest("Agent is currently disabled. Agent.status is 'off'")];
  }

  try {
    validateParams(params);
  } catch (err) {
    return [(err as OperationOutcomeError).outcome];
  }

  const waitTimeout = params.waitTimeout ?? DEFAULT_WAIT_TIMEOUT;
  if (waitTimeout < 0 || waitTimeout > MAX_WAIT_TIMEOUT) {
    return [badRequest('Invalid wait timeout')];
  }

  const device = await getDevice(repo, params);
  if (!device) {
    return [badRequest('Destination device not found')];
  }

  if (!device.url) {
    return [badRequest('Destination device missing url')];
  }

  const message: AgentTransmitRequest = {
    type: 'agent:transmit:request',
    remote: device.url,
    contentType: params.contentType,
    body: params.body,
  };

  // Publish the message to the agent channel
  const [outcome, response] = await publishAgentRequest<AgentTransmitResponse>(
    agent,
    message,
    params.waitForResponse ? { waitForResponse: true, timeout: waitTimeout } : undefined
  );

  if (!response) {
    return [outcome];
  }

  if (response.type === 'agent:error' || (response?.statusCode && response?.statusCode >= 400)) {
    return [badRequest(response.body)];
  }

  return [outcome, response];

  // At this point, one of two things will happen:
  // 1. The agent will respond with a message on the channel
  // 2. The timer will expire and the request will timeout
}

function validateParams(params: AgentPushParameters): void {
  if (!params.body) {
    throw new OperationOutcomeError(badRequest('Missing body parameter'));
  }

  if (!params.contentType) {
    throw new OperationOutcomeError(badRequest('Missing contentType parameter'));
  }

  if (!params.destination) {
    throw new OperationOutcomeError(badRequest('Missing destination parameter'));
  }
}
