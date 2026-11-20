// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import type {
  AgentConnectRequest,
  AgentConnectResponse,
  AgentHeartbeatResponse,
  AgentMessage,
  AgentRequestMessage,
  AgentResponseMessage,
  WithId,
} from '@medplum/core';
import { MEDPLUM_VERSION, allOk, createReference, forbidden, getWebSocketUrl } from '@medplum/core';
import type {
  Agent,
  Bundle,
  OperationOutcome,
  OperationOutcomeIssue,
  Parameters,
  ParametersParameter,
} from '@medplum/fhirtypes';
import type { Express } from 'express';
import request from 'supertest';
import type { MessageEvent } from 'ws';
import { WebSocket } from 'ws';
import { globalLogger } from '../../../logger';
import * as pubsub from '../../../pubsub';
import { addTestUser, createTestProject } from '../../../test.setup';

let serverPort: number | undefined;
const agentWsMap = new Map<string, WebSocket>();
const connectionPromiseMap = new Map<string, Promise<void>>();

export function configMockAgents(port: number): void {
  serverPort = port;
}

export function cleanupMockAgents(): void {
  for (const [agentId, ws] of agentWsMap) {
    ws.removeAllListeners();
    ws.close();
    agentWsMap.delete(agentId);
  }
  connectionPromiseMap.clear();
}

export interface MockAgentResponseHandle {
  cleanup(): void;
}

export async function mockAgentResponse<
  TRequest extends AgentRequestMessage = AgentRequestMessage,
  TResponse extends AgentResponseMessage = AgentResponseMessage,
>(
  agent: WithId<Agent>,
  accessToken: string,
  msgType: TRequest['type'],
  res: TResponse,
  onRequest?: (req: TRequest) => void
): Promise<MockAgentResponseHandle> {
  if (!serverPort) {
    throw new Error('Must call `configMockAgents()` before calling `mockAgentResponse()`');
  }

  if (!agentWsMap.has(agent.id)) {
    const ws = new WebSocket(getWebSocketUrl(`ws://localhost:${serverPort}/`, '/ws/agent'));
    ws.binaryType = 'nodebuffer';
    agentWsMap.set(agent.id, ws);
  }

  const ws = agentWsMap.get(agent.id) as WebSocket;
  const handler = (event: MessageEvent): void => {
    if (event.type === 'binary') {
      throw new Error('Invalid message type');
    }
    const msg = parseWebSocketMessageEvent<TRequest>(event);
    if (msg.type !== msgType) {
      return;
    }
    if (!msg.callback) {
      throw new Error('No callback in message to message received');
    }
    onRequest?.(msg);
    ws.send(JSON.stringify({ ...res, callback: msg.callback }));
  };
  ws.addEventListener('message', handler);

  // Await connection before returning
  await getConnectionPromise(ws, agent.id, accessToken);
  return {
    cleanup: () => {
      ws.removeEventListener('message', handler);
    },
  };
}

async function getConnectionPromise(ws: WebSocket, agentId: string, accessToken: string): Promise<void> {
  if (!connectionPromiseMap.has(agentId)) {
    const connectionPromise = new Promise<void>((resolve, reject) => {
      ws.addEventListener('open', () => {
        // Set a timeout for response
        const timeout = setTimeout(() => {
          reject(new Error('WebSocket connection timeout'));
        }, 2500);

        // Resolve the connection promise only after we receive a response
        const connectionHandler = (event: MessageEvent): void => {
          const msg = parseWebSocketMessageEvent<AgentConnectResponse>(event);
          if (msg.type === 'agent:connect:response') {
            clearTimeout(timeout);
            ws.removeEventListener('message', connectionHandler);
            resolve();
          }
        };
        ws.addEventListener('message', connectionHandler);

        ws.addEventListener('message', (event) => {
          const msg = parseWebSocketMessageEvent(event);
          if (msg.type === 'agent:heartbeat:request') {
            ws.send(
              JSON.stringify({
                type: 'agent:heartbeat:response',
                version: MEDPLUM_VERSION,
                callback: msg.callback,
              } satisfies AgentHeartbeatResponse)
            );
          } else if (msg.type === 'agent:error') {
            globalLogger.debug('Error from server to agent', { body: msg.body });
          }
        });

        ws.send(
          JSON.stringify({
            type: 'agent:connect:request',
            accessToken,
            agentId,
          } satisfies AgentConnectRequest)
        );
      });
    });
    // Put the promise in a map so that any call to mockAgentResponse for this agent will get the same promise
    connectionPromiseMap.set(agentId, connectionPromise);
  }
  return connectionPromiseMap.get(agentId);
}

function parseWebSocketMessageEvent<T extends AgentMessage = AgentMessage>(event: MessageEvent): T {
  const msg = JSON.parse((event.data as Buffer).toString('utf8')) as T;
  return msg;
}

export function expectBundleToContainOutcome(
  bundle: Bundle<Parameters>,
  agent: Agent,
  outcome: Partial<OperationOutcome> & { issue: OperationOutcomeIssue[] }
): void {
  const entries = bundle.entry;
  expect(entries).toContainEqual({
    resource: expect.objectContaining<Parameters>({
      resourceType: 'Parameters',
      parameter: expect.arrayContaining<ParametersParameter>([
        expect.objectContaining<ParametersParameter>({
          name: 'agent',
          resource: expect.objectContaining(agent),
        }),
        expect.objectContaining<ParametersParameter>({
          name: 'result',
          resource: expect.objectContaining<Partial<OperationOutcome>>(outcome),
        }),
      ]),
    }),
  });
}

export interface AgentAccessFixture {
  /** Token for a project admin, also used to connect mock agents. */
  adminToken: string;
  writableAgent: WithId<Agent>;
  readonlyAgent: WithId<Agent>;
  /** Tokens for users in the Agents' project who can only read Agents: a read-only AccessPolicy, then a `user/Agent.read` scope. */
  readonlyTokens: string[];
  /** Token for an admin of a project that links to the Agents' project. */
  linkedProjectToken: string;
  /** Token for a user who can update `writableAgent` but only read `readonlyAgent`. */
  mixedToken: string;
}

export async function createAgentAccessFixture(): Promise<AgentAccessFixture> {
  const { project, repo, accessToken } = await createTestProject({
    membership: { admin: true },
    withRepo: true,
    withAccessToken: true,
    extendedMode: false,
  });
  const writableAgent = await repo.createResource<Agent>({ resourceType: 'Agent', name: 'Writable', status: 'active' });
  const readonlyAgent = await repo.createResource<Agent>({ resourceType: 'Agent', name: 'Readonly', status: 'active' });

  const [readonlyPolicyUser, readScopeUser, mixedUser, linkedProject] = await Promise.all([
    addTestUser(project, {
      accessPolicy: { resourceType: 'AccessPolicy', resource: [{ resourceType: 'Agent', readonly: true }] },
    }),
    addTestUser(project, { scope: 'openid user/Agent.read' }),
    addTestUser(project, {
      accessPolicy: {
        resourceType: 'AccessPolicy',
        resource: [
          { resourceType: 'Agent', criteria: 'Agent?name=Writable' },
          { resourceType: 'Agent', readonly: true },
        ],
      },
    }),
    createTestProject({
      project: { link: [{ project: createReference(project) }] },
      membership: { admin: true },
      withAccessToken: true,
    }),
  ]);

  return {
    adminToken: accessToken,
    writableAgent,
    readonlyAgent,
    readonlyTokens: [readonlyPolicyUser.accessToken, readScopeUser.accessToken],
    linkedProjectToken: linkedProject.accessToken,
    mixedToken: mixedUser.accessToken,
  };
}

/**
 * Checks that an Agent operation runs only on Agents the caller can update, and that no other Agent is sent a message.
 * @param app - The Express app.
 * @param code - The operation code, e.g. `upgrade`.
 * @param requestType - The message type the operation sends to the agent.
 * @param response - The response for the mock agent to send.
 */
export async function expectAgentOperationRequiresUpdate<
  TRequest extends AgentRequestMessage,
  TResponse extends AgentResponseMessage,
>(app: Express, code: string, requestType: TRequest['type'], response: TResponse): Promise<void> {
  const { adminToken, writableAgent, readonlyAgent, readonlyTokens, linkedProjectToken, mixedToken } =
    await createAgentAccessFixture();
  const handle = await mockAgentResponse<TRequest, TResponse>(writableAgent, adminToken, requestType, response);
  const publishSpy = vi.spyOn(pubsub, 'publish');
  const agentChannels = (): string[] =>
    publishSpy.mock.calls.map(([channel]) => channel).filter((channel) => channel.startsWith('Agent/'));
  const get = (path: string, token: string): request.Test =>
    request(app)
      .get(`/fhir/R4/${path}`)
      .set('Authorization', 'Bearer ' + token);

  try {
    for (const token of readonlyTokens) {
      for (const path of [`Agent/${readonlyAgent.id}`, 'Agent']) {
        expect(await get(path, token)).toHaveStatus(200);
        expect(await get(`${path}/$${code}`, token)).toHaveStatus(403);
      }
    }

    // Linked projects grant read access only
    expect(await get(`Agent/${readonlyAgent.id}`, linkedProjectToken)).toHaveStatus(200);
    expect(await get(`Agent/${readonlyAgent.id}/$${code}`, linkedProjectToken)).toHaveStatus(403);
    let res = await get(`Agent/$${code}`, linkedProjectToken);
    expect(res).toHaveStatus(200);
    let bundle = res.body as Bundle<Parameters>;
    expect(bundle.entry).toHaveLength(2);
    expectBundleToContainOutcome(bundle, writableAgent, forbidden);
    expectBundleToContainOutcome(bundle, readonlyAgent, forbidden);
    expect(agentChannels()).toEqual([]);

    expect(await get(`Agent/${readonlyAgent.id}/$${code}`, mixedToken)).toHaveStatus(403);
    expect(await get(`Agent/${writableAgent.id}/$${code}`, mixedToken)).toHaveStatus(200);
    res = await get(`Agent/$${code}`, mixedToken);
    expect(res).toHaveStatus(200);
    bundle = res.body as Bundle<Parameters>;
    expect(bundle.entry).toHaveLength(2);
    expectBundleToContainOutcome(bundle, writableAgent, allOk);
    expectBundleToContainOutcome(bundle, readonlyAgent, forbidden);
    expect(bundle.entry?.map((entry) => entry.resource?.parameter?.[0]?.resource?.meta?.project)).toEqual([
      undefined,
      undefined,
    ]);
    expect(agentChannels()).toEqual([`Agent/${writableAgent.id}`, `Agent/${writableAgent.id}`]);
  } finally {
    publishSpy.mockRestore();
    handle.cleanup();
  }
}
