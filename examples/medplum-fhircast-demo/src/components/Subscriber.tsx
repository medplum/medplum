import { Dispatch, SetStateAction, useEffect, useState } from 'react';
import { BASE_URL } from '../config';
import { useClientId, useHubWSConnection } from '../hooks';
import { FHIRcastMessagePayload, isWebSocketMessage, serializeHubSubscriptionRequest } from '../utils';
import TopicLoader from './TopicLoader';

type FhirCastMessageDisplayProps = {
  eventNo: number;
  message: object;
};

function FhirCastMessageDisplay(props: FhirCastMessageDisplayProps): JSX.Element {
  return (
    <div style={{ paddingBottom: 15 }}>
      <div
        className="fhir-cast-message"
        style={{
          paddingLeft: 30,
          paddingRight: 30,
          paddingTop: 20,
          paddingBottom: 20,
          borderRadius: 10,
          textAlign: 'left',
        }}
      >
        <h3>Event No. {props.eventNo}</h3>
        <pre>{JSON.stringify(props.message, null, 2) ?? ''}</pre>
      </div>
    </div>
  );
}

type WebSocketHandlerProps = {
  endpoint: string;
  clientId: string;
  setCurrentPatientId: Dispatch<SetStateAction<string | null>>;
  setFhirCastMessages: Dispatch<SetStateAction<FHIRcastMessagePayload[]>>;
  setWebSocketStatus: (status: string) => void;
  incrementEventCount: () => void;
};

function WebSocketHandler(props: WebSocketHandlerProps): null {
  const { endpoint, setCurrentPatientId, setFhirCastMessages, setWebSocketStatus, incrementEventCount } = props;
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
        incrementEventCount();

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

export default function Subscriber(): JSX.Element {
  const [baseUrl, setBaseUrl] = useState(BASE_URL);
  const [baseUrlInput, setBaseUrlInput] = useState(BASE_URL);
  const [status, setStatus] = useState('NOT CONNECTED');
  const [currentPatientId, setCurrentPatientId] = useState<string | null>(null);
  const [topic, setTopic] = useState<string | null>(null);
  const [endpoint, setEndpoint] = useState<string | null>(null);
  const [fhirCastMessages, setFhirCastMessages] = useState<FHIRcastMessagePayload[]>([]);
  const [eventCount, setEventCount] = useState(0);

  const clientId = useClientId();

  useEffect(() => {
    if (topic) {
      // sub
      fetch(`${baseUrl}/fhircast/STU2`, {
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
  }, [topic, clientId, baseUrl]);

  return (
    <>
      {endpoint ? (
        <WebSocketHandler
          endpoint={endpoint}
          clientId={clientId}
          setCurrentPatientId={setCurrentPatientId}
          setFhirCastMessages={setFhirCastMessages}
          setWebSocketStatus={setStatus}
          incrementEventCount={() => setEventCount((s) => s + 1)}
        />
      ) : null}
      <div style={{ paddingBottom: 30 }}>
        <h1>Subscriber</h1>
      </div>
      <div
        style={{
          padding: 10,
          margin: '0 auto',
          display: 'flex',
          flexDirection: 'column',
          maxWidth: 300,
          justifyContent: 'center',
          paddingBottom: 20,
        }}
      >
        <input name="baseUrl" type="text" value={baseUrlInput} onChange={(e) => setBaseUrlInput(e.target.value)} />
        <div style={{ padding: 10 }}>
          <button type="button" onClick={() => setBaseUrl(baseUrlInput)}>
            Set base URL
          </button>
        </div>
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
          {fhirCastMessages.slice(0, 3).map((message, i) => {
            return <FhirCastMessageDisplay key={message.id} message={message} eventNo={eventCount - i} />;
          })}
        </div>
      </div>
    </>
  );
}
