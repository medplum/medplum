import { Accordion, Button, Chip, Group, Title } from '@mantine/core';
import { createReference, parseJWTPayload } from '@medplum/core';
import { Bundle, Communication, Parameters, Practitioner, Subscription } from '@medplum/fhirtypes';
import { Document, ResourceName, useMedplum, useMedplumProfile } from '@medplum/react';
import { IconArrowNarrowRight } from '@tabler/icons-react';
import { useState } from 'react';

const patientId = 'pat-123';
const providerId = 'provider-456';

interface BundleDisplayProps {
  bundle: Bundle;
}

function BundleDisplay(props: BundleDisplayProps): JSX.Element {
  const { bundle } = props;
  const communication = bundle?.entry?.[1].resource as Communication;
  return (
    <Accordion.Item key={bundle.id} value={`${bundle?.timestamp ?? 'Unknown time'} Chat Notification`}>
      <Accordion.Control>
        <Group>
          {bundle.timestamp} <Chip>{communication?.sender?.reference}</Chip>
          <IconArrowNarrowRight />
          <Chip>{communication?.recipient?.[0].reference}</Chip>
        </Group>
      </Accordion.Control>
      <Accordion.Panel>
        <div
          style={{
            paddingLeft: 30,
            paddingRight: 30,
            paddingTop: 20,
            paddingBottom: 20,
            borderRadius: 10,
            textAlign: 'left',
          }}
        >
          <pre>{JSON.stringify(bundle, null, 2)}</pre>
        </div>
      </Accordion.Panel>
    </Accordion.Item>
  );
}

/**
 * Home page that greets the user and displays a list of patients.
 * @returns A React component that displays the home page.
 */
export function HomePage(): JSX.Element {
  // useMedplumProfile() returns the "profile resource" associated with the user.
  // This can be a Practitioner, Patient, or RelatedPerson depending on the user's role in the project.
  // See the "Register" tutorial for more detail
  // https://www.medplum.com/docs/tutorials/register
  const profile = useMedplumProfile() as Practitioner;
  const medplum = useMedplum();

  const [subscriptions, setSubscriptions] = useState<Subscription[] | undefined>(undefined);
  const [working, setWorking] = useState(false);
  const [webSocket, setWebSocket] = useState<WebSocket | undefined>();
  const [bundles, setBundles] = useState<Bundle[]>([]);

  async function createSubscriptions(): Promise<void> {
    if (working) {
      return;
    }

    setWorking(true);

    const subscription1 = await medplum.createResource<Subscription>({
      resourceType: 'Subscription',
      criteria: `Communication?sender=Patient/${patientId}`,
      status: 'active',
      reason: 'Watch for Communications for this user.',
      channel: {
        type: 'websocket',
      },
    });

    const subscription2 = await medplum.createResource<Subscription>({
      resourceType: 'Subscription',
      criteria: `Communication?recipient=Patient/${patientId}`,
      status: 'active',
      reason: 'Watch for Communications for this user.',
      channel: {
        type: 'websocket',
      },
    });

    setSubscriptions([subscription1, subscription2]);
    setWorking(false);
  }

  async function listenForSubs(): Promise<void> {
    if (working || !subscriptions) {
      return;
    }

    setWorking(true);

    const tokens = [] as string[];
    let url: string | undefined;

    for (const subscription of subscriptions) {
      // Create binding
      const { parameter } = (await medplum.get(
        `/fhir/R4/Subscription/${subscription.id}/$get-ws-binding-token`
      )) as Parameters;
      const token = parameter?.find((param) => param.name === 'token')?.valueString;
      if (token && !tokens.includes(token)) {
        tokens.push(token);
      }
      if (!url) {
        url = parameter?.find((param) => param.name === 'websocket-url')?.valueUrl;
      }
    }

    if (!tokens.length) {
      throw new Error('Failed to get token!');
    }
    if (!url) {
      throw new Error('Failed to get URL from $get-ws-binding-token!');
    }

    const ws = new WebSocket(url);

    console.log('tokens[0] payload', parseJWTPayload(tokens[0]));

    ws.addEventListener('open', () => {
      for (const token of tokens) {
        ws.send(JSON.stringify({ type: 'bind-with-token', payload: { token } }));
      }
    });

    ws.addEventListener('message', (event: MessageEvent<string>) => {
      const bundle = JSON.parse(event.data);
      setBundles((s) => [...s, bundle]);
    });

    setWebSocket(ws);
    setWorking(false);
  }

  async function createOutgoingMessage(): Promise<void> {
    await medplum.createResource<Communication>({
      resourceType: 'Communication',
      status: 'completed',
      sender: createReference({ resourceType: 'Patient', id: patientId }),
      recipient: [createReference({ resourceType: 'Practitioner', id: providerId })],
    });
  }

  async function createIncomingMessage(): Promise<void> {
    await medplum.createResource<Communication>({
      resourceType: 'Communication',
      status: 'completed',
      sender: createReference({ resourceType: 'Practitioner', id: providerId }),
      recipient: [createReference({ resourceType: 'Patient', id: patientId })],
    });
  }

  function closeWebSocket(): void {
    if (!webSocket) {
      return;
    }
    webSocket.close();
    setWebSocket(undefined);
  }

  async function deleteSubscriptions(): Promise<void> {
    if (working || !subscriptions) {
      return;
    }

    setWorking(true);
    for (const subscription of subscriptions) {
      await medplum.deleteResource('Subscription', subscription.id as string);
    }
    setSubscriptions(undefined);
    setWorking(false);
  }

  return (
    <Document>
      <Title>
        Welcome <ResourceName value={profile} link />
      </Title>
      <Group position="center" pt="xl">
        <Button
          onClick={!subscriptions ? () => createSubscriptions().catch(console.error) : undefined}
          disabled={working || !!subscriptions}
        >
          Create Subscriptions
        </Button>
        <Button
          onClick={subscriptions ? () => listenForSubs().catch(console.error) : undefined}
          disabled={working || !subscriptions || !!webSocket}
          mx={10}
        >
          Connect via WebSocket
        </Button>
        <Button
          onClick={webSocket ? () => createOutgoingMessage().catch(console.error) : undefined}
          disabled={working || !webSocket}
        >
          Create Outgoing Message
        </Button>
        <Button
          onClick={webSocket ? () => createIncomingMessage().catch(console.error) : undefined}
          disabled={working || !webSocket}
        >
          Create Incoming Message
        </Button>
      </Group>
      <Group position="center" pt="xl">
        <Button onClick={webSocket ? closeWebSocket : undefined} disabled={!webSocket} variant="outline">
          Disconnect from WebSocket
        </Button>
        <Button
          onClick={subscriptions && !webSocket ? () => deleteSubscriptions().catch(console.error) : undefined}
          disabled={working || !subscriptions || !!webSocket}
          variant="outline"
        >
          Delete Subscriptions
        </Button>
      </Group>
      <Accordion mt={50}>
        {bundles.map((bundle) => (
          <BundleDisplay bundle={bundle} key={bundle.id} />
        ))}
      </Accordion>
    </Document>
  );
}
