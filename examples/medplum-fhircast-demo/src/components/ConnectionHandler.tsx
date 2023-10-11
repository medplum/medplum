import { FhircastConnection, FhircastMessageEvent, FhircastMessagePayload, SubscriptionRequest } from '@medplum/core';
import { useMedplum } from '@medplum/react';
import { useEffect, useRef, useState } from 'react';

type ConnectionStatus = 'IDLE' | 'CONNECTING' | 'CONNECTED' | 'DISCONNECTING' | 'DISCONNECTED';

type WebSocketHandlerProps = {
  subRequest: SubscriptionRequest;
  clientId: string;
  onMessage: (message: FhircastMessagePayload) => void;
  onStatusChange?: (status: ConnectionStatus) => void;
};

export default function ConnectionHandler(props: WebSocketHandlerProps): null {
  const medplum = useMedplum();
  const { subRequest, onMessage, onStatusChange } = props;
  const [connectionStatus, setConnectionStatus] = useState<ConnectionStatus>('IDLE');

  const connectionRef = useRef<FhircastConnection>();
  const onMessageRef = useRef(onMessage);

  useEffect(() => {
    onMessageRef.current = onMessage;
  }, [onMessage]);

  useEffect(() => {
    if (onStatusChange) {
      onStatusChange(connectionStatus);
    }
  }, [onStatusChange, connectionStatus]);

  useEffect(() => {
    if (connectionRef.current?.subRequest.endpoint === subRequest.endpoint) {
      return;
    }

    if (connectionRef.current) {
      connectionRef.current.disconnect();
      connectionRef.current = undefined;
    }

    if (!subRequest) {
      return;
    }

    const connection = medplum.fhircastConnect(subRequest);

    const connectHandler = (): void => {
      console.log('here');
      setConnectionStatus('CONNECTED');
    };
    const messageHandler = (event: FhircastMessageEvent): void => onMessageRef.current(event.payload);
    const disconnectHandler = (): void => {
      setConnectionStatus('DISCONNECTED');
      connection.removeEventListener('connect', connectHandler);
      connection.removeEventListener('message', messageHandler);
      connection.removeEventListener('disconnect', disconnectHandler);
    };

    connection.addEventListener('connect', connectHandler);
    connection.addEventListener('message', messageHandler);
    connection.addEventListener('disconnect', disconnectHandler);

    connectionRef.current = connection;
  }, [medplum, subRequest]);

  return null;
}
