import { useMedplum } from '@medplum/react';
import { useEffect, useState } from 'react';
import { Outlet } from 'react-router-dom';
import { useClientId } from '../hooks';
import { FhircastMessagePayload, serializeHubSubscriptionRequest } from '../utils';
import TopicLoader from './TopicLoader';
import WebSocketHandler from './WebSocketHandler';

type FhircastMessageDisplayProps = {
  eventNo: number;
  message: FhircastMessagePayload;
};

function FhircastMessageDisplay(props: FhircastMessageDisplayProps): JSX.Element {
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
        <pre>{JSON.stringify(props.message, null, 2)}</pre>
      </div>
    </div>
  );
}

export default function Subscriber(): JSX.Element {
  const medplum = useMedplum();
  const [status, setStatus] = useState('NOT CONNECTED');
  const [currentPatientId, setCurrentPatientId] = useState<string | undefined>();
  const [topic, setTopic] = useState<string | undefined>();
  const [endpoint, setEndpoint] = useState<string | undefined>();
  const [fhirCastMessages, setFhircastMessages] = useState<FhircastMessagePayload[]>([]);
  const [eventCount, setEventCount] = useState(0);

  const clientId = useClientId();

  useEffect(() => {
    if (topic) {
      // sub
      medplum
        .post(
          'fhircast/STU2',
          serializeHubSubscriptionRequest({
            channelType: 'websocket',
            mode: 'subscribe',
            topic,
            events: ['patient-open'],
          }),
          'application/x-www-form-urlencoded'
        )
        .then(async (body: { 'hub.channel.endpoint': string }) => {
          const endpoint = body?.['hub.channel.endpoint'];
          if (!endpoint) {
            throw new Error('Invalid response!');
          }
          setEndpoint(endpoint);
          setStatus('SUBSCRIBED');
        })
        .catch((err) => console.error(err));
    } else {
      // unset endpoint (closing WS connection) when the topic is unset (cannot reuse websocket anyways since endpoint contains a slug)
      setEndpoint(undefined);
    }
  }, [topic, clientId, medplum]);

  return (
    <>
      {endpoint ? (
        <WebSocketHandler
          endpoint={endpoint}
          clientId={clientId}
          setCurrentPatientId={setCurrentPatientId}
          setFhircastMessages={setFhircastMessages}
          setWebSocketStatus={setStatus}
          incrementEventCount={() => setEventCount((s) => s + 1)}
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
          {fhirCastMessages.slice(0, 3).map((message, i) => {
            return <FhircastMessageDisplay key={message.id} message={message} eventNo={eventCount - i} />;
          })}
        </div>
      </div>
      <Outlet />
    </>
  );
}
