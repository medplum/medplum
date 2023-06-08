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
    logger.debug('on new connection!');
    socket.send('hello');

    socket.on('message', (data: ws.RawData, isBinary: boolean) => {
      logger.debug('Received: %s', data, isBinary);
      socket.send(`echo ${data}`);
    });

    socket.on('error', (err: Error) => {
      logger.debug('WebSocket error observed:', err);
      socket.close();
    });

    socket.on('close', () => {
      logger.debug('WebSocket connection closed');
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
