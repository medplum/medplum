// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import {
  AgentError,
  AgentRequestMessage,
  AgentResponseMessage,
  ContentType,
  OperationOutcomeError,
  Operator,
  WithId,
  allOk,
  badRequest,
  getReferenceString,
  isOk,
  isValidHostname,
  parseSearchRequest,
  serverError,
  singularize,
} from '@medplum/core';
import { FhirRequest, FhirResponse } from '@medplum/fhir-router';
import { Agent, Bundle, BundleEntry, Device, OperationOutcome, Parameters } from '@medplum/fhirtypes';
import { Request } from 'express';
import { randomUUID } from 'node:crypto';
import { isIPv4 } from 'node:net';
import { getAuthenticatedContext } from '../../../context';
import { getRedis, getRedisSubscriber } from '../../../redis';
import { Repository } from '../../repo';
import { AgentPushParameters } from '../agentpush';

export const MAX_AGENTS_PER_PAGE = 100;

/**
 * Returns the Agent for a request.
 *
 * All Agent operations support lookup by ID or identifier.
 *
 * For example:
 *
 * If using "/Agent/:id/$push", then the agent ID is read from the path parameter.
 * If using "/Agent/$push?identifier=...", then the agent is searched by identifier.
 * Otherwise, returns undefined.
 *
 * @param req - The HTTP request.
 * @param repo - The repository.
 * @returns The agent, or undefined if not found.
 */
export async function getAgentForRequest(
  req: Request | FhirRequest,
  repo: Repository
): Promise<WithId<Agent> | undefined> {
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

/**
 * Returns the Agents for a request.
 *
 * @param req - The HTTP request.
 * @param repo - The repository.
 * @returns The agent, or undefined if not found.
 */
export async function getAgentsForRequest(req: FhirRequest, repo: Repository): Promise<WithId<Agent>[] | undefined> {
  if (req.params.id) {
    const agent = await getAgentForRequest(req, repo);
    return agent ? [agent] : undefined;
  }
  return repo.searchResources(parseSearchRequest('Agent', req.query));
}

export async function getDevice(repo: Repository, params: AgentPushParameters): Promise<Device | undefined> {
  const { destination, contentType } = params;
  if (destination.startsWith('Device/')) {
    try {
      return await repo.readReference<Device>({ reference: destination });
    } catch (_err) {
      return undefined;
    }
  }
  if (destination.startsWith('Device?')) {
    return repo.searchOne<Device>(parseSearchRequest(destination));
  }
  if (contentType === ContentType.PING && (isIPv4(destination) || isValidHostname(destination))) {
    return { resourceType: 'Device', url: destination };
  }
  return undefined;
}

export async function handleBulkAgentOperation(
  req: FhirRequest,
  handler: (agent: WithId<Agent>) => Promise<FhirResponse>
): Promise<FhirResponse> {
  const { repo } = getAuthenticatedContext();

  const count = singularize(req.query._count);
  if (count && Number.parseInt(count, 10) > MAX_AGENTS_PER_PAGE) {
    return [badRequest(`'_count' of ${count} is greater than max of ${MAX_AGENTS_PER_PAGE}`)];
  }

  const agents = await getAgentsForRequest(req, repo);
  if (!agents?.length) {
    return [badRequest('No agent(s) for given query')];
  }

  if (req.params.id) {
    return handler(agents[0]);
  }

  const promises = agents.map((agent) => handler(agent));
  const results = await Promise.allSettled(promises);
  const entries: BundleEntry<Parameters>[] = [];

  for (let i = 0; i < results.length; i++) {
    const result = results[i];
    if (result.status === 'rejected') {
      entries.push(
        makeResultWrapperEntry(
          result.reason instanceof OperationOutcomeError ? result.reason.outcome : serverError(result.reason as Error),
          agents[i]
        )
      );
      continue;
    }
    const [outcome, params] = result.value;
    if (!(isOk(outcome) && params)) {
      entries.push(makeResultWrapperEntry(outcome, agents[i]));
      continue;
    }
    entries.push(makeResultWrapperEntry(params as Parameters, agents[i]));
  }

  return [
    allOk,
    {
      resourceType: 'Bundle',
      type: 'collection',
      entry: entries,
    } satisfies Bundle<Parameters>,
  ];
}

export function makeResultWrapperEntry(result: Parameters | OperationOutcome, agent: Agent): BundleEntry<Parameters> {
  return {
    resource: {
      resourceType: 'Parameters',
      parameter: [
        { name: 'agent', resource: agent },
        { name: 'result', resource: result },
      ],
    },
  };
}

export interface AgentMessageOptions {
  waitForResponse: boolean;
  timeout?: number;
}

export async function publishAgentRequest<T extends AgentResponseMessage = AgentResponseMessage>(
  agent: WithId<Agent>,
  message: AgentRequestMessage,
  options?: AgentMessageOptions
): Promise<[OperationOutcome] | [OperationOutcome, T | AgentError]> {
  if (options?.waitForResponse) {
    // If a callback doesn't already exist on the message, tie callback to the associated agent and assign a random ID
    message.callback = getReferenceString(agent) + '-' + randomUUID();

    const redisSubscriber = getRedisSubscriber();
    await redisSubscriber.subscribe(message.callback);

    const resultPromise = new Promise<[OperationOutcome, T | AgentError]>((resolve, reject) => {
      redisSubscriber.on('message', (_channel: string, message: string) => {
        const response = JSON.parse(message) as T | AgentError;
        resolve([allOk, response]);
        cleanup();
      });

      // Create a timer for 5 seconds for timeout
      const timer = setTimeout(() => {
        cleanup();
        // eslint-disable-next-line prefer-promise-reject-errors
        reject(new OperationOutcomeError(badRequest('Timeout')) as Error);
      }, options?.timeout ?? 5000);

      const cleanup = (): void => {
        redisSubscriber.disconnect();
        clearTimeout(timer);
      };
    });

    await publishRequestMessage(agent, message);
    const result = await resultPromise;
    return result;
  }

  await publishRequestMessage(agent, message);
  return [allOk];
}

export interface SendAndHandleAgentRequestOptions<T extends AgentResponseMessage = AgentResponseMessage> {
  successHandler?: (response: T) => Parameters;
  messageOptions?: Partial<AgentMessageOptions>;
}

export async function sendAndHandleAgentRequest<T extends AgentResponseMessage = AgentResponseMessage>(
  agent: WithId<Agent>,
  message: AgentRequestMessage,
  expectedResponseType: T['type'],
  options?: SendAndHandleAgentRequestOptions<T>
): Promise<FhirResponse> {
  // Send agent message
  const [outcome, result] = await publishAgentRequest<T>(agent, message, {
    ...options?.messageOptions,
    waitForResponse: true,
  });

  if (!result) {
    return [outcome];
  }

  if (result.type === 'agent:error') {
    throw new OperationOutcomeError(badRequest(result.body));
  }

  if (result.type === expectedResponseType) {
    const parameters = options?.successHandler?.(result);
    return parameters ? [outcome, parameters] : [outcome];
  }

  throw new OperationOutcomeError(serverError(new Error('Invalid response received from agent')));
}

function publishRequestMessage<T extends AgentRequestMessage = AgentRequestMessage>(
  agent: WithId<Agent>,
  message: T
): Promise<number> {
  return getRedis().publish(getReferenceString(agent), JSON.stringify(message));
}
