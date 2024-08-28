import {
  AgentConnectRequest,
  AgentMessage,
  AgentTransmitRequest,
  ContentType,
  Hl7Message,
  MEDPLUM_VERSION,
  getReferenceString,
  normalizeErrorString,
} from '@medplum/core';
import { Agent, Bot, Reference } from '@medplum/fhirtypes';
import { Redis } from 'ioredis';
import { AsyncLocalStorage } from 'node:async_hooks';
import { IncomingMessage } from 'node:http';
import ws from 'ws';
import { getRepoForLogin } from '../fhir/accesspolicy';
import { executeBot } from '../fhir/operations/execute';
import { heartbeat } from '../heartbeat';
import { globalLogger } from '../logger';
import { getLoginForAccessToken } from '../oauth/utils';
import { getRedis, getRedisSubscriber } from '../redis';
import { AgentConnectionState, AgentInfo } from './utils';

const INFO_EX_SECONDS = 24 * 60 * 60; // 24 hours in seconds

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

  const heartbeatHandler = (): void => sendMessage({ type: 'agent:heartbeat:request' });

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

          case 'agent:heartbeat:request':
            sendMessage({ type: 'agent:heartbeat:response', version: MEDPLUM_VERSION });
            break;

          case 'agent:heartbeat:response':
            await updateAgentInfo({ status: AgentConnectionState.CONNECTED, version: command.version });
            break;

          // @ts-expect-error - Deprecated message type
          case 'transmit':
          case 'agent:transmit:request':
            await handleTransmit(command);
            break;

          case 'agent:transmit:response':
          case 'agent:reloadconfig:response':
          case 'agent:upgrade:response':
            if (command.callback) {
              const redis = getRedis();
              await redis.publish(command.callback, JSON.stringify(command));
            }
            break;

          case 'agent:error':
            if (command.callback) {
              const redis = getRedis();
              await redis.publish(command.callback, JSON.stringify(command));
            }
            globalLogger.error('[Agent]: Error received from agent', { error: command.body });
            break;

          default:
            sendError(`Unknown message type: ${command.type}`);
        }
      } catch (err) {
        sendError(normalizeErrorString(err));
      }
    })
  );

  socket.on(
    'close',
    AsyncLocalStorage.bind(async () => {
      await updateAgentStatus(AgentConnectionState.DISCONNECTED);
      heartbeat.removeEventListener('heartbeat', heartbeatHandler);
      redisSubscriber?.disconnect();
      redisSubscriber = undefined;
      agentId = undefined;
    })
  );

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

    const authState = await getLoginForAccessToken(command.accessToken);
    if (!authState) {
      sendError('Invalid access token');
      return;
    }

    const repo = await getRepoForLogin(authState, true);
    const agent = await repo.readResource<Agent>('Agent', agentId);

    // Connect to Redis
    redisSubscriber = getRedisSubscriber();
    await redisSubscriber.subscribe(getReferenceString(agent));
    redisSubscriber.on('message', (_channel: string, message: string) => {
      // When a message is received, send it to the agent
      socket.send(message, { binary: false });
    });

    // Subscribe to heartbeat events
    heartbeat.addEventListener('heartbeat', heartbeatHandler);

    // Send connected message
    sendMessage({ type: 'agent:connect:response' });

    // Update the agent status in Redis
    await updateAgentStatus(AgentConnectionState.CONNECTED);
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

    const authState = await getLoginForAccessToken(command.accessToken);
    if (!authState) {
      sendError('Invalid access token');
      return;
    }

    const repo = await getRepoForLogin(authState, true);
    const agent = await repo.readResource<Agent>('Agent', agentId);
    const channel = agent?.channel?.find((c) => c.name === command.channel);
    if (!channel) {
      sendError('Channel not found');
      return;
    }

    const bot = await repo.readReference(channel.targetReference as Reference<Bot>);

    let input: any = command.body;
    if (command.contentType === ContentType.JSON || command.contentType === ContentType.FHIR_JSON) {
      input = JSON.parse(input);
    } else if (command.contentType === ContentType.HL7_V2) {
      input = Hl7Message.parse(input);
    }

    const result = await executeBot({
      agent,
      bot,
      runAs: authState.membership,
      contentType: command.contentType,
      input,
      remoteAddress,
      forwardedFor: command.remote,
    });

    let body: string;
    if (result.returnValue && !result.success) {
      body = JSON.stringify(result.returnValue);
    } else if (result.returnValue) {
      body = result.returnValue;
    } else {
      body = `Bot execution logs:\n${result.logResult}`;
    }

    sendMessage({
      type: 'agent:transmit:response',
      channel: command.channel,
      remote: command.remote,
      contentType: result.success ? command.contentType : ContentType.JSON,
      statusCode: result.success ? 200 : 400,
      body,
    });
  }

  function sendMessage(message: AgentMessage): void {
    socket.send(JSON.stringify(message), { binary: false });
  }

  function sendError(body: string): void {
    sendMessage({ type: 'agent:error', body });
  }

  /**
   * Updates the agent info in Redis.
   * This is used by the Agent "$status" operation to monitor agent status and other info.
   * See packages/server/src/fhir/operations/agentstatus.ts for more details.
   * @param info - The latest info received from the Agent.
   */
  async function updateAgentInfo(info: AgentInfo): Promise<void> {
    if (!agentId) {
      // Not connected
    }

    let redis: Redis;
    try {
      redis = getRedis();
    } catch (err) {
      globalLogger.warn(`[Agent]: Attempted to update agent info after server closed. ${normalizeErrorString(err)}`);
      return;
    }

    await redis.set(
      `medplum:agent:${agentId}:info`,
      JSON.stringify({
        ...info,
        lastUpdated: new Date().toISOString(),
      } satisfies AgentInfo),
      'EX',
      INFO_EX_SECONDS
    );
  }

  async function updateAgentStatus(status: AgentConnectionState): Promise<void> {
    if (!agentId) {
      // Not connected
    }

    let redis: Redis;
    try {
      redis = getRedis();
    } catch (err) {
      globalLogger.warn(`[Agent]: Attempted to update agent status after server closed. ${normalizeErrorString(err)}`);
      return;
    }

    const lastInfo = await redis.get(`medplum:agent:${agentId}:info`);
    if (!lastInfo) {
      await updateAgentInfo({ status, version: 'unknown', lastUpdated: new Date().toISOString() });
      return;
    }
    await updateAgentInfo({ ...(JSON.parse(lastInfo) as AgentInfo), status });
  }
}
