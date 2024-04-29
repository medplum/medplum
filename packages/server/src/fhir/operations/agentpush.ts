import { AgentTransmitRequest, AgentTransmitResponse, badRequest, serverError } from '@medplum/core';
import { OperationOutcome, Parameters } from '@medplum/fhirtypes';
import { Request, Response } from 'express';
import { asyncWrap } from '../../async';
import { getAuthenticatedContext } from '../../context';
import { sendOutcome } from '../outcomes';
import { getAgentForRequest, getDevice, publishAgentMessage } from './agentutils';
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
        pushToAgent(req, (outcome, agentResponse) => {
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
    await pushToAgent(req, (outcome, agentResponse) => {
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
  sendOperationResponse: (outcome: OperationOutcome, agentResponse?: AgentTransmitResponse) => void
): Promise<void> {
  const { repo } = getAuthenticatedContext();

  // Read the agent as the user to verify access
  const agent = await getAgentForRequest(req, repo);
  if (!agent) {
    sendOperationResponse(badRequest('Must specify agent ID or identifier'));
    return;
  }

  const params = parseParameters<AgentPushParameters>(req.body);
  if (!params.body) {
    sendOperationResponse(badRequest('Missing body parameter'));
    return;
  }

  if (!params.contentType) {
    sendOperationResponse(badRequest('Missing contentType parameter'));
    return;
  }

  if (!params.destination) {
    sendOperationResponse(badRequest('Missing destination parameter'));
    return;
  }

  const waitTimeout = params.waitTimeout ?? DEFAULT_WAIT_TIMEOUT;
  if (waitTimeout < 0 || waitTimeout > MAX_WAIT_TIMEOUT) {
    sendOperationResponse(badRequest('Invalid wait timeout'));
    return;
  }

  const device = await getDevice(repo, params);
  if (!device) {
    sendOperationResponse(badRequest('Destination device not found'));
    return;
  }

  if (!device.url) {
    sendOperationResponse(badRequest('Destination device missing url'));
    return;
  }

  const message: AgentTransmitRequest = {
    type: 'agent:transmit:request',
    remote: device.url,
    contentType: params.contentType,
    body: params.body,
  };

  // Publish the message to the agent channel
  const [outcome, response] = await publishAgentMessage<AgentTransmitResponse>(
    agent,
    message,
    params.waitForResponse ? { waitForResponse: true, timeout: waitTimeout } : undefined
  );

  if (!response) {
    sendOperationResponse(outcome);
    return;
  }

  if (response.type === 'agent:error' || (response?.statusCode && response?.statusCode >= 400)) {
    sendOperationResponse(serverError(new Error(response.body)));
    return;
  }

  sendOperationResponse(outcome, response);

  // At this point, one of two things will happen:
  // 1. The agent will respond with a message on the channel
  // 2. The timer will expire and the request will timeout
}
