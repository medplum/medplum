import { ContentType } from '@medplum/core';
import { Bot, ProjectMembership } from '@medplum/fhirtypes';
import bytes from 'bytes';
import { randomUUID } from 'crypto';
import http from 'http';
import ws from 'ws';
import { getConfig } from './config';
import { executeBot } from './fhir/operations/execute';
import { systemRepo } from './fhir/repo';
import { logger } from './logger';
import { getRedis } from './redis';

const handlerMap = new Map<string, (socket: ws.WebSocket) => Promise<void>>();
handlerMap.set('/ws/echo', handleEchoConnection);
handlerMap.set('/ws/agent', handleAgentConnection);

let wsServer: ws.Server | undefined = undefined;

/**
 * Initializes a websocket listener on the given HTTP server.
 * @param server The HTTP server.
 */
export function initWebSockets(server: http.Server): void {
  wsServer = new ws.Server({
    noServer: true,
    maxPayload: bytes(getConfig().maxJsonSize) as number,
  });

  wsServer.on('connection', async (socket, request) => {
    // Set binary type to 'nodebuffer' so that data is returned as Buffer objects
    // See: https://github.com/websockets/ws/blob/master/doc/ws.md#websocketbinarytype
    socket.binaryType = 'nodebuffer';

    const handler = handlerMap.get(request.url as string);
    if (handler) {
      await handler(socket);
    }
  });

  server.on('upgrade', (request, socket, head) => {
    if (request.url && handlerMap.has(request.url)) {
      wsServer?.handleUpgrade(request, socket, head, (socket) => {
        wsServer?.emit('connection', socket, request);
      });
    } else {
      socket.destroy();
    }
  });
}

/**
 * Handles a new WebSocket connection to the echo service.
 * The echo service simply echoes back whatever it receives.
 * @param socket The WebSocket connection.
 */
async function handleEchoConnection(socket: ws.WebSocket): Promise<void> {
  // Create a redis client for this connection.
  // According to Redis documentation: http://redis.io/commands/subscribe
  // Once the client enters the subscribed state it is not supposed to issue any other commands,
  // except for additional SUBSCRIBE, PSUBSCRIBE, UNSUBSCRIBE and PUNSUBSCRIBE commands.
  const redisSubscriber = getRedis().duplicate();
  const channel = randomUUID();

  await redisSubscriber.subscribe(channel);

  redisSubscriber.on('message', (channel: string, message: string) => {
    logger.debug('[WS] redis message', { channel, message });
    socket.send(message, { binary: false });
  });

  socket.on('message', async (data: ws.RawData) => {
    await getRedis().publish(channel, data as Buffer);
  });

  socket.on('close', async () => {
    redisSubscriber.disconnect();
  });
}

/**
 * Handles a new WebSocket connection to the agent service.
 * The agent service executes a bot and returns the result.
 * @param socket The WebSocket connection.
 */
async function handleAgentConnection(socket: ws.WebSocket): Promise<void> {
  let bot: Bot | undefined = undefined;
  let runAs: ProjectMembership | undefined = undefined;

  socket.on('message', async (data: ws.RawData) => {
    const command = JSON.parse((data as Buffer).toString('utf8'));
    switch (command.type) {
      case 'connect':
        await handleConnect(command);
        break;

      case 'transmit':
        await handleTransmit(command);
        break;
    }
  });

  async function handleConnect(command: any): Promise<void> {
    // TODO: Validate the access token
    bot = await systemRepo.readResource<Bot>('Bot', command.botId);
    runAs = await systemRepo.readResource<ProjectMembership>('ProjectMembership', command.projectMembershipId);
    socket.send(JSON.stringify({ type: 'connected' }));
  }

  async function handleTransmit(command: any): Promise<void> {
    if (!bot || !runAs) {
      socket.send(JSON.stringify({ type: 'error', message: 'Not connected' }));
      return;
    }
    const contentType = ContentType.HL7_V2;
    const result = await executeBot({
      bot,
      runAs,
      contentType,
      input: command.message,
    });
    socket.send(JSON.stringify({ type: 'transmit', message: result.returnValue }), { binary: false });
  }
}

export function closeWebSockets(): void {
  if (wsServer) {
    wsServer.close();
    wsServer = undefined;
  }
}
