import { Dispatch, SetStateAction, useCallback, useEffect, useRef } from 'react';
import { FhircastMessagePayload } from '../utils';

type WebSocketHandlerProps = {
  endpoint: string;
  clientId: string;
  setCurrentPatientId: Dispatch<SetStateAction<string | undefined>>;
  setFhircastMessages: Dispatch<SetStateAction<FhircastMessagePayload[]>>;
  setWebSocketStatus: (status: string) => void;
  incrementEventCount: () => void;
};

export default function WebSocketHandler(props: WebSocketHandlerProps): null {
  const { endpoint, setCurrentPatientId, setFhircastMessages, setWebSocketStatus, incrementEventCount } = props;
  const webSocketRef = useRef<WebSocket | undefined>();

  const handleFhircastMessage = useCallback(
    (fhircastMessage: FhircastMessagePayload) => {
      // Get the patient ID from the first context of the event
      const patientId = fhircastMessage.event.context[0].resource.id as string;
      setCurrentPatientId(patientId);
      setFhircastMessages((s: FhircastMessagePayload[]) => [fhircastMessage, ...s]);
      incrementEventCount();
    },
    [incrementEventCount, setCurrentPatientId, setFhircastMessages]
  );

  useEffect(() => {
    if (webSocketRef.current?.url === endpoint) {
      return;
    }

    if (webSocketRef.current) {
      webSocketRef.current.close();
      webSocketRef.current = undefined;
    }

    if (!endpoint) {
      return;
    }

    const ws = new WebSocket(endpoint);

    ws.addEventListener('open', () => {
      setWebSocketStatus('CONNECTED');

      ws.addEventListener('message', (event: MessageEvent) => {
        const message = JSON.parse(event.data) as Record<string, string | object>;

        // This is a check for `subscription request confirmations`, we just discard these for now
        if (message['hub.topic']) {
          return;
        }

        const fhircastMessage = message as unknown as FhircastMessagePayload;
        handleFhircastMessage(fhircastMessage);

        ws.send(
          JSON.stringify({
            id: message?.id,
            timestamp: new Date().toISOString(),
          })
        );
      });
    });

    webSocketRef.current = ws;
  }, [endpoint, handleFhircastMessage, setWebSocketStatus]);

  return null;
}
