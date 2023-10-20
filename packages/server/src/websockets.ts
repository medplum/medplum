import bytes from 'bytes';
import { randomUUID } from 'crypto';
import http, { IncomingMessage } from 'http';
import ws from 'ws';
import { handleAgentConnection } from './agent/websockets';
import { getConfig } from './config';
import { RequestContext, requestContextStore } from './context';
import { handleFhircastConnection } from './fhircast/websocket';
import { globalLogger } from './logger';
import { getRedis } from './redis';

const handlerMap = new Map<string, (socket: ws.WebSocket, request: IncomingMessage) => Promise<void>>();
handlerMap.set('echo', handleEchoConnection);
handlerMap.set('agent', handleAgentConnection);
handlerMap.set('fhircast', handleFhircastConnection);

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

    const handler = handlerMap.get(getWebSocketPath(request.url as string));
    if (handler) {
      await requestContextStore.run(RequestContext.empty(), () => handler(socket, request));
    } else {
      socket.close();
    }
  });

  server.on('upgrade', (request, socket, head) => {
    if (handlerMap.has(getWebSocketPath(request.url as string))) {
      wsServer?.handleUpgrade(request, socket, head, (socket) => {
        wsServer?.emit('connection', socket, request);
      });
    } else {
      socket.write('HTTP/1.1 404 Not Found\r\n\r\n');
      socket.destroy();
    }
  });
}

function getWebSocketPath(path: string): string {
  return path.split('/').filter(Boolean)[1];
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
    globalLogger.debug('[WS] redis message', { channel, message });
    socket.send(message, { binary: false });
  });

  socket.on('message', async (data: ws.RawData) => {
    await getRedis().publish(channel, data as Buffer);
  });

  socket.on('close', async () => {
    redisSubscriber.disconnect();
  });
}

export function closeWebSockets(): void {
  if (wsServer) {
    wsServer.close();
    wsServer = undefined;
  }
}
