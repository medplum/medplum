const webSocketMap = new Map<string, WebSocket>();

export function getOrCreateWebSocketClient(url: URL | string): WebSocket {
  let urlString: string;
  if (typeof url === 'string') {
    urlString = url;
  } else if (url instanceof WebSocket) {
    urlString = url.toString();
  } else {
    throw new Error('url must be URL object or string!');
  }

  if (webSocketMap.has(urlString)) {
    return webSocketMap.get(urlString) as WebSocket;
  }

  const ws = new WebSocket(url);
  webSocketMap.set(urlString, ws);

  ws.addEventListener('close', () => {
    webSocketMap.delete(urlString);
  });

  return ws;
}
