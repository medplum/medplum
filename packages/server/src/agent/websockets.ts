import { ContentType, getReferenceString, normalizeErrorString } from '@medplum/core';
import { Agent, Bot, Reference } from '@medplum/fhirtypes';
import { AsyncLocalStorage } from 'async_hooks';
import { IncomingMessage } from 'http';
import { Redis } from 'ioredis';
import ws from 'ws';
import { getRepoForLogin } from '../fhir/accesspolicy';
import { executeBot } from '../fhir/operations/execute';
import { getLoginForAccessToken } from '../oauth/utils';
import { getRedis } from '../redis';

/**
 * Handles a new WebSocket connection to the agent service.
 * The agent service executes a bot and returns the result.
 * @param socket The WebSocket connection.
 * @param request The HTTP request.
 */
export async function handleAgentConnection(socket: ws.WebSocket, request: IncomingMessage): Promise<void> {
  const remoteAddress = request.socket.remoteAddress;
  let agentId: string | undefined = undefined;

  // Create a redis client for this connection.
  // According to Redis documentation: http://redis.io/commands/subscribe
  // Once the client enters the subscribed state it is not supposed to issue any other commands,
  // except for additional SUBSCRIBE, PSUBSCRIBE, UNSUBSCRIBE and PUNSUBSCRIBE commands.
  let redisSubscriber: Redis | undefined = undefined;

  socket.on(
    'message',
    AsyncLocalStorage.bind(async (data: ws.RawData) => {
      try {
        const command = JSON.parse((data as Buffer).toString('utf8'));
        switch (command.type) {
          case 'connect':
            await handleConnect(command);
            break;

          case 'transmit':
            await handleTransmit(command);
            break;
        }
      } catch (err) {
        socket.send(JSON.stringify({ type: 'error', body: normalizeErrorString(err) }));
      }
    })
  );

  socket.on('close', () => {
    redisSubscriber?.disconnect();
  });

  /**
   * Handles a connect command.
   * This command is sent by the agent to connect to the server.
   * The command includes the access token and bot ID.
   * @param command The connect command.
   */
  async function handleConnect(command: any): Promise<void> {
    if (!command.accessToken) {
      sendError(socket, 'Missing access token');
      return;
    }

    if (!command.agentId) {
      sendError(socket, 'Missing agent ID');
      return;
    }

    agentId = command.agentId as string;

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

    // Send connected message
    socket.send(JSON.stringify({ type: 'connected' }));
  }

  /**
   * Handles a transit command.
   * This command is sent by the agent to transmit a message.
   * @param command The transmit command.
   */
  async function handleTransmit(command: any): Promise<void> {
    if (!agentId) {
      sendError(socket, 'Not connected');
      return;
    }

    if (!command.accessToken) {
      sendError(socket, 'Missing access token');
      return;
    }

    if (!command.channel) {
      sendError(socket, 'Missing channel');
      return;
    }

    if (!command.body) {
      sendError(socket, 'Missing body');
      return;
    }

    const { login, project, membership } = await getLoginForAccessToken(command.accessToken);
    const repo = await getRepoForLogin(login, membership, project.strictMode, true, project.checkReferencesOnWrite);
    const agent = await repo.readResource<Agent>('Agent', agentId);
    const channel = agent?.channel?.find((c) => c.name === command.channel);
    if (!channel) {
      socket.send(JSON.stringify({ type: 'error', body: 'Channel not found' }));
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

    socket.send(
      JSON.stringify({
        type: 'transmit',
        channel: command.channel,
        remote: command.remote,
        body: result.returnValue,
      }),
      { binary: false }
    );
  }
}

function sendError(socket: ws.WebSocket, body: string): void {
  socket.send(JSON.stringify({ type: 'error', body }));
}
