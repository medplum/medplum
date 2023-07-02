import http from 'http';
import ws from 'ws';
import { logger } from './logger';

let wsServer: ws.Server | undefined = undefined;

/**
 * Initializes a websocket listener on the given HTTP server.
 * @param server The HTTP server.
 */
export function initWebSockets(server: http.Server): void {
  wsServer = new ws.Server({ noServer: true });

  wsServer.on('connection', (socket: ws.WebSocket) => {
    logger.debug('[WS] connection');

    socket.on('message', (data: ws.RawData, binary: boolean) => {
      logger.debug('[WS] message', data, binary);
      socket.send(data, { binary });
    });

    socket.on('error', (err: Error) => {
      logger.debug('[WS] error', err);
      socket.close();
    });

    socket.on('close', () => {
      logger.debug('[WS] close');
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
