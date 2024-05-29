import { Accordion, Center, Divider, Group, Stack, Text, Title } from '@mantine/core';
import { FhircastMessagePayload, SubscriptionRequest } from '@medplum/core';
import { Document, useMedplum, usePrevious } from '@medplum/react';
import { IconMessage2Exclamation } from '@tabler/icons-react';
import { useCallback, useEffect, useState } from 'react';
import { useClientId } from '../hooks';
import ConnectionHandler from './ConnectionHandler';
import TopicLoader from './TopicLoader';

type FhircastMessageDisplayProps = {
  readonly eventNo: number;
  readonly message: FhircastMessagePayload<'Patient-open'>;
};

function FhircastMessageLabel(props: FhircastMessageDisplayProps): JSX.Element {
  const { message, eventNo } = props;
  return (
    <Group wrap="nowrap">
      <IconMessage2Exclamation />
      <div>
        <Text fw={700} c="dimmed">
          {message.timestamp}
        </Text>
        <Text>Event No. {eventNo}</Text>
        <Text size="sm" fw={400}>
          Event: <b>{message.event['hub.event']}</b>
        </Text>
        <Stack pt={20}>
          <Text>
            Notification ID: <b>{message.id}</b>
          </Text>
          <Text size="sm" fw={400}>
            Topic: <b>{message.event['hub.topic']}</b>
          </Text>
          <Text size="sm" fw={400}>
            Resource ID: <b>{message.event.context[0].resource.id}</b>
          </Text>
        </Stack>
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
  const [currentPatientId, setCurrentPatientId] = useState<string>();
  const [topic, setTopic] = useState<string>();
  const [subRequest, setSubRequest] = useState<SubscriptionRequest>();
  const [fhircastMessages, setFhircastMessages] = useState<FhircastMessagePayload<'Patient-open'>[]>([]);
  const [eventCount, setEventCount] = useState(0);
  const prevTopic = usePrevious(topic);

  const clientId = useClientId();

  useEffect(() => {
    if (prevTopic === topic) {
      return;
    }
    if (topic && !subRequest) {
      // sub
      medplum
        .fhircastSubscribe(topic, ['Patient-open'])
        .then((subRequest) => {
          setSubRequest(subRequest);
        })
        .catch((err) => console.error(err));
    } else if (!topic && subRequest) {
      // unset subRequest (closing WS connection) when the topic is unset (cannot reuse websocket anyways since endpoint contains a slug)
      medplum
        .fhircastUnsubscribe(subRequest)
        .then(() => {
          setSubRequest(undefined);
        })
        .catch(console.error);
    }
  }, [prevTopic, topic, subRequest, medplum]);

  const handleFhircastMessage = useCallback((fhircastMessage: FhircastMessagePayload) => {
    if (fhircastMessage.event['hub.event'] !== 'Patient-open') {
      console.error("Received unexpected event type! Ignoring all events except for 'Patient-open'");
      return;
    }

    // Get the patient ID from the first context of the event
    const patientId = (fhircastMessage as FhircastMessagePayload<'Patient-open'>).event.context[0].resource
      .id as string;

    setCurrentPatientId(patientId);
    setFhircastMessages((s: FhircastMessagePayload<'Patient-open'>[]) => [
      fhircastMessage as FhircastMessagePayload<'Patient-open'>,
      ...s,
    ]);
    setEventCount((s) => s + 1);
  }, []);

  return (
    <Document>
      <ConnectionHandler
        subRequest={subRequest}
        clientId={clientId}
        onMessage={handleFhircastMessage}
        onStatusChange={(status) => setStatus(status)}
      />
      <Title ta="center" fz={36}>
        Subscriber
      </Title>
      <Center>
        <div style={{ width: 350 }}>
          <TopicLoader onSetTopic={(topic) => setTopic(topic)} />
        </div>
      </Center>
      <Stack align="center" p={25}>
        <Text>Status: {status}</Text>
        <Text>Current topic: {topic ?? 'No topic'}</Text>
        <Text>Current patient: {currentPatientId ?? 'No current patient'}</Text>
      </Stack>
      {fhircastMessages.length ? (
        <>
          <Divider />
          <Stack pt={20}>
            <Title ta="center" order={2}>
              Events
            </Title>
            <Accordion title="Events">
              {fhircastMessages.slice(0, 5).map((message, i) => {
                return <FhircastMessageDisplay key={message.id} message={message} eventNo={eventCount - i} />;
              })}
            </Accordion>
          </Stack>
        </>
      ) : null}
    </Document>
  );
}
