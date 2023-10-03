import { Dispatch, SetStateAction, useCallback, useEffect, useRef } from 'react';
import { FHIRcastMessagePayload } from '../utils';

type WebSocketHandlerProps = {
  endpoint: string;
  clientId: string;
  setCurrentPatientId: Dispatch<SetStateAction<string | null>>;
  setFhirCastMessages: Dispatch<SetStateAction<FHIRcastMessagePayload[]>>;
  setWebSocketStatus: (status: string) => void;
  incrementEventCount: () => void;
};

export default function WebSocketHandler(props: WebSocketHandlerProps): null {
  const { endpoint, setCurrentPatientId, setFhirCastMessages, setWebSocketStatus, incrementEventCount } = props;
  const webSocketRef = useRef<WebSocket | undefined>();

  const handleFHIRcastMessage = useCallback(
    (fhircastMessage: FHIRcastMessagePayload) => {
      const patientId = fhircastMessage.event.context[0].resource.id as string;
      setCurrentPatientId(patientId);
      setFhirCastMessages((s: FHIRcastMessagePayload[]) => [fhircastMessage, ...s]);
      incrementEventCount();
    },
    [incrementEventCount, setCurrentPatientId, setFhirCastMessages]
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

        const fhircastMessage = message as unknown as FHIRcastMessagePayload;
        handleFHIRcastMessage(fhircastMessage);

        // Get the patient ID from the first context of the event

        ws.send(
          JSON.stringify({
            id: message?.id,
            timestamp: new Date().toISOString(),
          })
        );
      });
    });

    webSocketRef.current = ws;
  }, [endpoint, handleFHIRcastMessage, setWebSocketStatus]);

  return null;
}
