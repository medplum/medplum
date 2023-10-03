import { useEffect, useMemo, useRef, useState } from 'react';
import { FHIRcastMessagePayload, WebSocketMessage, WrappedWebSocket, isWebSocketMessage } from '../utils';
import { getOrCreateWebSocketClient } from '../websocket-client';

type HubWSConnectionOptions = {
  onConnect: () => void;
};

/* eslint-disable-next-line @typescript-eslint/no-redundant-type-constituents */
type WrappedClientWebSocket = WrappedWebSocket<WebSocket> & {
  on: (messageType: string, handler: (message: Record<string, any>) => void) => void;
};

type HubHookConnection = {
  websocket: WrappedClientWebSocket;
};

const DEBUG = true;
const debug = (...args: any[]): void => {
  console.log(args);
};

const subscriberId = crypto.randomUUID();

export function useClientId(): string {
  const [clientId] = useState<string>(subscriberId);
  return clientId;
}

export function useHubWSConnection(hubUrl: string, options?: HubWSConnectionOptions): HubHookConnection {
  const [wsClient, setWsClient] = useState(getOrCreateWebSocketClient(hubUrl));

  const wsHandlersRef = useRef(
    {} as Record<string, ((message: WebSocketMessage) => void) | ((message: FHIRcastMessagePayload) => void)>
  );

  useEffect(() => {
    if (options?.onConnect) {
      const { onConnect } = options;
      wsClient.addEventListener('open', onConnect);
      return () => {
        wsClient.removeEventListener('open', onConnect);
      };
    }
    return () => {};
  }, []);

  useEffect(() => {
    const messageHandler = (event: MessageEvent): void => {
      const message = JSON.parse(event.data) as Record<string, string>;
      if (!isWebSocketMessage(message)) {
        const fhirHandler = wsHandlersRef.current.FHIRcast as (message: FHIRcastMessagePayload) => void;
        if (fhirHandler) {
          // @ts-expect-error This should be fine but union type of the handlers is probably not what we want for this (should be keyed on event type)
          fhirHandler(message as FHIRcastMessagePayload);
        }
      } else if (wsHandlersRef.current[message.type]) {
        // @ts-expect-error this is fine because FHIRcast is just an exception...
        wsHandlersRef.current[message.type](message);
      } else {
        // eslint-disable-next-line no-unused-expressions
        DEBUG && debug(`Failed to handle event of type: ${message.type}`);
      }
    };
    wsClient.addEventListener('message', messageHandler);
    return () => {
      wsClient.removeEventListener('message', messageHandler);
    };
  }, [wsClient]);

  useEffect(() => {
    if (!wsClient) {
      const ws = getOrCreateWebSocketClient(hubUrl);
      setWsClient(ws);
    }
  }, [wsClient, hubUrl]);

  const memoizedInterface = useMemo(
    () => ({
      websocket: {
        ws: wsClient,
        sendMessage: (message: WebSocketMessage) => wsClient.send(JSON.stringify(message)),
        on: (messageType: string, handler: (message: Record<string, any>) => void) => {
          wsHandlersRef.current[messageType] = handler;
        },
      },
    }),
    [wsClient]
  );

  return memoizedInterface;
}

export function usePrevious<T>(value: T): T | undefined {
  const ref = useRef<T>();
  useEffect(() => {
    ref.current = value;
  });
  return ref.current;
}
