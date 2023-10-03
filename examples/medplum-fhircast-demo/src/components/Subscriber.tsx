import { Dispatch, SetStateAction, useEffect, useState } from 'react';
import { useClientId, useHubWSConnection } from '../hooks';
import { FHIRcastMessagePayload, isWebSocketMessage, serializeHubSubscriptionRequest } from '../utils';
import TopicLoader from './TopicLoader';

type Subscriber1Props = {
  hubPort: number;
};

type FhirCastMessageDisplayProps = {
  message: object;
};

function FhirCastMessageDisplay(props: FhirCastMessageDisplayProps): JSX.Element {
  return (
    <div style={{ paddingBottom: 15 }}>
      <pre
        style={{
          textAlign: 'left',
          backgroundColor: '#1b1b1b',
          padding: 20,
          borderRadius: 10,
        }}
      >
        {JSON.stringify(props.message, null, 2) ?? ''}
      </pre>
    </div>
  );
}

type WebSocketHandlerProps = {
  endpoint: string;
  clientId: string;
  setCurrentPatientId: Dispatch<SetStateAction<string | null>>;
  setFhirCastMessages: Dispatch<SetStateAction<FHIRcastMessagePayload[]>>;
  setWebSocketStatus: (status: string) => void;
};

function WebSocketHandler(props: WebSocketHandlerProps): null {
  const { endpoint, setCurrentPatientId, setFhirCastMessages, setWebSocketStatus } = props;
  const { websocket } = useHubWSConnection(endpoint, {
    onConnect: () => {
      console.log('here!');
      setWebSocketStatus('CONNECTED');

      // expect pong
      websocket.on('pong', (message: Record<string, any>) => {
        if (!isWebSocketMessage(message)) {
          throw new Error('Invalid payload for message type `PONG`!');
        }
        setWebSocketStatus(`GOT MESSAGE: ${message.type}`);
      });

      // after pong, setup a listener for patient open
      websocket.on('FHIRcast', (message: Record<string, any>) => {
        if (message['hub.topic']) {
          return;
        }
        const fhirCastMessage = message as FHIRcastMessagePayload;

        // Find event for
        const patientId = message.event.context[0].resource.id;
        setCurrentPatientId(patientId);
        setFhirCastMessages((s: FHIRcastMessagePayload[]) => [fhirCastMessage, ...s]);

        websocket.sendMessage({
          // @ts-expect-error Exception for acks
          id: message?.id,
          timestamp: new Date().toISOString(),
        });
      });

      // send ping
      websocket.sendMessage({ type: 'ping', payload: {} });
    },
  });
  return null;
}

export default function Subscriber(props: Subscriber1Props): JSX.Element {
  const { hubPort } = props;

  const [status, setStatus] = useState('NOT CONNECTED');
  const [currentPatientId, setCurrentPatientId] = useState<string | null>(null);
  const [topic, setTopic] = useState<string | null>(null);
  const [endpoint, setEndpoint] = useState<string | null>(null);
  const [fhirCastMessages, setFhirCastMessages] = useState<FHIRcastMessagePayload[]>([]);

  const clientId = useClientId();

  useEffect(() => {
    if (topic) {
      // sub
      fetch(`http://localhost:${hubPort}/hub`, {
        method: 'POST',
        body: serializeHubSubscriptionRequest({
          channelType: 'websocket',
          mode: 'subscribe',
          topic,
          events: ['patient-open'],
        }),
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          Authorization: `Bearer ${clientId}`,
        },
      })
        .then(async (res: Response) => {
          const body = (await res.json()) as { 'hub.channel.endpoint': string };
          console.log(body);
          const endpoint = body?.['hub.channel.endpoint'];
          if (!endpoint) {
            throw new Error('Invalid response!');
          }
          setEndpoint(endpoint);
          setStatus('SUBSCRIBED');
        })
        .catch((err) => console.error(err));

      return () => {
        // unsub on `unmount`
      };
    }
    return () => {};
  }, [topic, clientId, hubPort]);

  return (
    <>
      {endpoint ? (
        <WebSocketHandler
          endpoint={endpoint}
          clientId={clientId}
          setCurrentPatientId={setCurrentPatientId}
          setFhirCastMessages={setFhirCastMessages}
          setWebSocketStatus={setStatus}
        />
      ) : null}
      <div style={{ paddingBottom: 30 }}>
        <h1>Subscriber</h1>
      </div>
      <div style={{ flex: 1 }}>
        <div>
          <TopicLoader onSetTopic={(topic) => setTopic(topic)} />
        </div>
        <div>Status: {status}</div>
        <div>Current topic: {topic ?? 'No topic'}</div>
        <div>Current Patient: {currentPatientId ?? 'No current patient'}</div>
        <div style={{ paddingTop: 30, height: 500 }}>
          <h2>Events</h2>
          {fhirCastMessages.slice(0, 3).map((message) => {
            return <FhirCastMessageDisplay key={message.id} message={message} />;
          })}
        </div>
      </div>
    </>
  );
}
