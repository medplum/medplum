import bytes from 'bytes';
import { randomUUID } from 'crypto';
import http from 'http';
import ws from 'ws';
import { getConfig } from './config';
import { logger } from './logger';
import { getRedis } from './redis';

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

  wsServer.on('connection', async (socket: ws.WebSocket) => {
    // Set binary type to 'nodebuffer' so that data is returned as Buffer objects
    // See: https://github.com/websockets/ws/blob/master/doc/ws.md#websocketbinarytype
    socket.binaryType = 'nodebuffer';

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
  });

  server.on('upgrade', (request, socket, head) => {
    if (request.url === '/ws') {
      wsServer?.handleUpgrade(request, socket, head, (socket) => {
        wsServer?.emit('connection', socket, request);
      });
    } else {
      socket.destroy();
    }
  });
}

export function closeWebSockets(): void {
  if (wsServer) {
    wsServer.close();
    wsServer = undefined;
  }
}
