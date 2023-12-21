import {
  AgentConnectRequest,
  AgentMessage,
  AgentTransmitRequest,
  ContentType,
  getReferenceString,
  normalizeErrorString,
} from '@medplum/core';
import { Agent, Bot, Reference } from '@medplum/fhirtypes';
import { AsyncLocalStorage } from 'async_hooks';
import { IncomingMessage } from 'http';
import { Redis } from 'ioredis';
import ws from 'ws';
import { getRepoForLogin } from '../fhir/accesspolicy';
import { executeBot } from '../fhir/operations/execute';
import { heartbeat } from '../heartbeat';
import { getLoginForAccessToken } from '../oauth/utils';
import { getRedis } from '../redis';

/**
 * Handles a new WebSocket connection to the agent service.
 * The agent service executes a bot and returns the result.
 * @param socket - The WebSocket connection.
 * @param request - The HTTP request.
 */
export async function handleAgentConnection(socket: ws.WebSocket, request: IncomingMessage): Promise<void> {
  const remoteAddress = request.socket.remoteAddress;
  let agentId: string | undefined = undefined;

  // Create a redis client for this connection.
  // According to Redis documentation: http://redis.io/commands/subscribe
  // Once the client enters the subscribed state it is not supposed to issue any other commands,
  // except for additional SUBSCRIBE, PSUBSCRIBE, UNSUBSCRIBE and PUNSUBSCRIBE commands.
  let redisSubscriber: Redis | undefined = undefined;

  const heartbeatHandler = (): void => sendMessage({ type: 'agent:ping:request' });

  socket.on(
    'message',
    AsyncLocalStorage.bind(async (data: ws.RawData) => {
      try {
        const command = JSON.parse((data as Buffer).toString('utf8')) as AgentMessage;
        switch (command.type) {
          // @ts-expect-error - Deprecated message type
          case 'connect':
          case 'agent:connect:request':
            await handleConnect(command);
            break;

          case 'agent:ping:request':
            sendMessage({ type: 'agent:ping:response' });
            break;

          case 'agent:ping:response':
            // Do nothing
            break;

          // @ts-expect-error - Deprecated message type
          case 'transmit':
          case 'agent:transmit:request':
            await handleTransmit(command);
            break;

          case 'agent:transmit:response':
            if (command.callback) {
              const redis = getRedis();
              await redis.publish(command.callback, JSON.stringify(command));
            }
            break;

          default:
            sendError(`Unknown message type: ${command.type}`);
        }
      } catch (err) {
        sendError(normalizeErrorString(err));
      }
    })
  );

  socket.on('close', () => {
    heartbeat.removeEventListener('heartbeat', heartbeatHandler);
    redisSubscriber?.disconnect();
    redisSubscriber = undefined;
  });

  /**
   * Handles a connect command.
   * This command is sent by the agent to connect to the server.
   * The command includes the access token and bot ID.
   * @param command - The connect command.
   */
  async function handleConnect(command: AgentConnectRequest): Promise<void> {
    if (!command.accessToken) {
      sendError('Missing access token');
      return;
    }

    if (!command.agentId) {
      sendError('Missing agent ID');
      return;
    }

    agentId = command.agentId;

    const { login, project, membership } = await getLoginForAccessToken(command.accessToken);
    const repo = await getRepoForLogin(login, membership, project.strictMode, true, project.checkReferencesOnWrite);
    const agent = await repo.readResource<Agent>('Agent', agentId);

    // Connect to Redis
    redisSubscriber = getRedis().duplicate();
    await redisSubscriber.subscribe(getReferenceString(agent));
    redisSubscriber.on('message', (_channel: string, message: string) => {
      // When a message is received, send it to the agent
      socket.send(message, { binary: false });
    });

    // Subscribe to heartbeat events
    heartbeat.addEventListener('heartbeat', heartbeatHandler);

    // Send connected message
    sendMessage({ type: 'agent:connect:response' });
  }

  /**
   * Handles a transit command.
   * This command is sent by the agent to transmit a message.
   * @param command - The transmit command.
   */
  async function handleTransmit(command: AgentTransmitRequest): Promise<void> {
    if (!agentId) {
      sendError('Not connected');
      return;
    }

    if (!command.accessToken) {
      sendError('Missing access token');
      return;
    }

    if (!command.channel) {
      sendError('Missing channel');
      return;
    }

    if (!command.body) {
      sendError('Missing body');
      return;
    }

    const { login, project, membership } = await getLoginForAccessToken(command.accessToken);
    const repo = await getRepoForLogin(login, membership, project.strictMode, true, project.checkReferencesOnWrite);
    const agent = await repo.readResource<Agent>('Agent', agentId);
    const channel = agent?.channel?.find((c) => c.name === command.channel);
    if (!channel) {
      sendError('Channel not found');
      return;
    }

    const bot = await repo.readReference(channel.targetReference as Reference<Bot>);

    const result = await executeBot({
      agent,
      bot,
      runAs: membership,
      contentType: ContentType.HL7_V2,
      input: command.body,
      remoteAddress,
      forwardedFor: command.remote,
    });

    sendMessage({
      type: 'agent:transmit:response',
      channel: command.channel,
      remote: command.remote,
      contentType: ContentType.HL7_V2,
      body: result.returnValue,
    });
  }

  function sendMessage(message: AgentMessage): void {
    socket.send(JSON.stringify(message), { binary: false });
  }

  function sendError(body: string): void {
    sendMessage({ type: 'agent:error', body });
  }
}
