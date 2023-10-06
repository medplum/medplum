import { Accordion, Center, Divider, Group, Text, Title } from '@mantine/core';
import { Document, useMedplum } from '@medplum/react';
import { IconMessage2Exclamation } from '@tabler/icons-react';
import { useEffect, useState } from 'react';
import { useClientId } from '../hooks';
import { FhircastMessagePayload, serializeHubSubscriptionRequest } from '../utils';
import TopicLoader from './TopicLoader';
import WebSocketHandler from './WebSocketHandler';

type FhircastMessageDisplayProps = {
  eventNo: number;
  message: FhircastMessagePayload;
};

function FhircastMessageLabel(props: FhircastMessageDisplayProps): JSX.Element {
  const { message, eventNo } = props;
  return (
    <Group noWrap={true}>
      <IconMessage2Exclamation />
      <div>
        <Text fw={700} c="dimmed">
          {message.timestamp}
        </Text>
        <Text>Event No. {eventNo}</Text>
        <Text size="sm" fw={400}>
          Event: <b>{message.event['hub.event']}</b>
        </Text>

        <div style={{ paddingTop: 20 }}>
          <Text>
            Notification ID: <b>{message.id}</b>
          </Text>
          <Text size="sm" fw={400}>
            Topic: <b>{message.event['hub.topic']}</b>
          </Text>

          <Text size="sm" fw={400}>
            Resource ID: <b>{message.event.context[0].resource.id}</b>
          </Text>
        </div>
      </div>
    </Group>
  );
}

function FhircastMessageDisplay(props: FhircastMessageDisplayProps): JSX.Element {
  const { eventNo, message } = props;
  return (
    <Accordion.Item key={eventNo} value={`${message.timestamp} - Event No. ${eventNo}`}>
      <Accordion.Control>
        <FhircastMessageLabel {...props} />
      </Accordion.Control>

      <Accordion.Panel>
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
          <pre>{JSON.stringify(message, null, 2)}</pre>
        </div>
      </Accordion.Panel>
    </Accordion.Item>
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
    <Document>
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
      <Center>
        <Title fz={36}>Subscriber</Title>
      </Center>
      <div>
        <Center>
          <div style={{ width: 300 }}>
            <TopicLoader onSetTopic={(topic) => setTopic(topic)} />
          </div>
        </Center>
      </div>
      <div style={{ paddingTop: 20, paddingBottom: 20 }}>
        <Center>
          <Text>Status: {status}</Text>
        </Center>
        <Center>
          <Text>Current topic: {topic ?? 'No topic'}</Text>
        </Center>
        <Center>
          <Text>Current patient: {currentPatientId ?? 'No current patient'}</Text>
        </Center>
      </div>
      {fhirCastMessages.length ? (
        <>
          <Divider />
          <div style={{ paddingTop: 20 }}>
            <Center>
              <Title order={2}>Events</Title>
            </Center>
            <Accordion title="Events">
              {fhirCastMessages.slice(0, 5).map((message, i) => {
                return <FhircastMessageDisplay key={message.id} message={message} eventNo={eventCount - i} />;
              })}
            </Accordion>
          </div>
        </>
      ) : null}
    </Document>
  );
}
