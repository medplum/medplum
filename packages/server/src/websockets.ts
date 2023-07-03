import { randomUUID } from 'crypto';
import http from 'http';
import ws from 'ws';
import { logger } from './logger';
import { getRedis } from './redis';

let wsServer: ws.Server | undefined = undefined;

/**
 * Initializes a websocket listener on the given HTTP server.
 * @param server The HTTP server.
 */
export function initWebSockets(server: http.Server): void {
  wsServer = new ws.Server({ noServer: true });

  wsServer.on('connection', async (socket: ws.WebSocket) => {
    logger.debug('[WS] connection');

    const redis = getRedis();
    const channel = randomUUID();

    redis.on('message', (channel: string, message: string) => {
      logger.debug('[WS] redis message', channel, message);
      socket.send(message, { binary: false });
    });

    redis.on('messageBuffer', (channel: string, message: Buffer) => {
      logger.debug('[WS] redis messageBuffer', channel, message);
      socket.send(message, { binary: true });
    });

    await redis.subscribe(channel);

    socket.on('message', async (data: ws.RawData, binary: boolean) => {
      logger.debug('[WS] message', data, binary);
      await redis.publish(channel, rawDataToBuffer(data));
    });

    socket.on('error', async (err: Error) => {
      logger.debug('[WS] error', err);
      await redis.unsubscribe(channel);
      socket.close();
    });

    socket.on('close', async () => {
      logger.debug('[WS] close');
      await redis.unsubscribe(channel);
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

function rawDataToBuffer(data: ws.RawData): Buffer {
  if (Buffer.isBuffer(data)) {
    return data;
  }
  if (data instanceof ArrayBuffer) {
    return Buffer.from(data);
  }
  // Otherwise data is Buffer[]
  return Buffer.concat(data);
}
