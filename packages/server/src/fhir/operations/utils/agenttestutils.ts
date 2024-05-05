import {
  AgentConnectRequest,
  AgentConnectResponse,
  AgentHeartbeatResponse,
  AgentMessage,
  AgentRequestMessage,
  AgentResponseMessage,
  MEDPLUM_VERSION,
  getWebSocketUrl,
} from '@medplum/core';
import {
  Agent,
  Bundle,
  BundleEntry,
  OperationOutcome,
  OperationOutcomeIssue,
  Parameters,
  ParametersParameter,
} from '@medplum/fhirtypes';
import { MessageEvent, WebSocket } from 'ws';

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
>(agent: Agent, accessToken: string, msgType: TRequest['type'], res: TResponse): Promise<MockAgentResponseHandle> {
  if (!serverPort) {
    throw new Error('Must call `configMockAgents()` before calling `mockAgentResponse()`');
  }

  if (!agentWsMap.has(agent.id as string)) {
    const ws = new WebSocket(getWebSocketUrl(`ws://localhost:${serverPort}/`, '/ws/agent'));
    ws.binaryType = 'nodebuffer';
    agentWsMap.set(agent.id as string, ws);
  }

  const ws = agentWsMap.get(agent.id as string) as WebSocket;
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
    ws.send(JSON.stringify({ ...res, callback: msg.callback }));
  };
  ws.addEventListener('message', handler);

  // Await connection before returning
  await getConnectionPromise(ws, agent.id as string, accessToken);
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
            console.debug('Error from server to agent:', msg.body);
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
  return connectionPromiseMap.get(agentId) as Promise<void>;
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
  const entries = bundle.entry as BundleEntry<Parameters>[];
  expect(entries).toContainEqual({
    resource: expect.objectContaining<Parameters>({
      resourceType: 'Parameters',
      parameter: expect.arrayContaining<ParametersParameter>([
        expect.objectContaining<ParametersParameter>({
          name: 'agent',
          resource: expect.objectContaining<Agent>(agent),
        }),
        expect.objectContaining<ParametersParameter>({
          name: 'result',
          resource: expect.objectContaining<Partial<OperationOutcome>>(outcome),
        }),
      ]),
    }),
  });
}
