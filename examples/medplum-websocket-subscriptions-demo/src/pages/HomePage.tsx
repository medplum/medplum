import { Accordion, Button, Chip, Group, Title } from '@mantine/core';
import { createReference, parseReference } from '@medplum/core';
import { Bundle, Communication, Parameters, Patient, Practitioner, Reference, Subscription } from '@medplum/fhirtypes';
import { DrAliceSmith, HomerSimpson } from '@medplum/mock';
import { Document, ResourceName, useMedplum, useMedplumProfile } from '@medplum/react';
import { IconArrowNarrowRight } from '@tabler/icons-react';
import { useState } from 'react';

interface BundleDisplayProps {
  bundle: Bundle;
}

function BundleDisplay(props: BundleDisplayProps): JSX.Element {
  const { bundle } = props;
  const communication = bundle?.entry?.[1].resource as Communication;
  const [senderType, senderId] = parseReference(communication?.sender as Reference);
  const [recipientType, recipientId] = parseReference(communication?.recipient?.[0] as Reference);
  return (
    <Accordion.Item value={`${bundle?.timestamp ?? 'Unknown time'}: Chat Notification`}>
      <Accordion.Control>
        <Group>
          {bundle.timestamp}{' '}
          <Chip checked={false}>
            {senderType}/{senderId.slice(0, 8)}
          </Chip>
          <IconArrowNarrowRight />
          <Chip checked={false}>
            {recipientType}/{recipientId.slice(0, 8)}
          </Chip>
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

  const [subscription, setSubscription] = useState<Subscription | undefined>(undefined);
  const [working, setWorking] = useState(false);
  const [webSocket, setWebSocket] = useState<WebSocket | undefined>();
  const [bundles, setBundles] = useState<Bundle[]>([]);
  const [patient, setPatient] = useState<Patient | undefined>();
  const [practitioner, setPractitioner] = useState<Practitioner | undefined>();

  async function createSubscription(): Promise<void> {
    if (working) {
      return;
    }

    setWorking(true);

    const homer = await medplum.createResourceIfNoneExist(HomerSimpson, 'name="Homer Simpson"');
    const drAlice = await medplum.createResourceIfNoneExist(DrAliceSmith, 'name="Alice Smith"');

    const subscription = await medplum.createResource<Subscription>({
      resourceType: 'Subscription',
      criteria: `Communication?_compartment=Patient/${homer.id as string}`,
      status: 'active',
      reason: 'Watch for Communications for this user.',
      channel: {
        type: 'websocket',
      },
    });

    setSubscription(subscription);
    setPatient(homer);
    setPractitioner(drAlice);
    setWorking(false);
  }

  async function listenForSubs(): Promise<void> {
    if (working || !subscription) {
      return;
    }

    setWorking(true);
    // Create binding
    const { parameter } = (await medplum.get(
      `/fhir/R4/Subscription/${subscription.id}/$get-ws-binding-token`
    )) as Parameters;

    const token = parameter?.find((param) => param.name === 'token')?.valueString;
    const url = parameter?.find((param) => param.name === 'websocket-url')?.valueUrl;
    if (!token) {
      throw new Error('Failed to get token!');
    }
    if (!url) {
      throw new Error('Failed to get URL from $get-ws-binding-token!');
    }

    const ws = new WebSocket(url);

    ws.addEventListener('open', () => {
      ws.send(JSON.stringify({ type: 'bind-with-token', payload: { token } }));
    });

    ws.addEventListener('message', (event: MessageEvent<string>) => {
      const bundle = JSON.parse(event.data);
      console.log(bundle);
      setBundles((s) => [...s, bundle]);
    });

    setWebSocket(ws);
    setWorking(false);
  }

  async function createOutgoingMessage(): Promise<void> {
    if (!(patient && practitioner)) {
      return;
    }
    await medplum.createResource<Communication>({
      resourceType: 'Communication',
      status: 'completed',
      sender: createReference({ resourceType: 'Patient', id: patient.id as string }),
      recipient: [createReference({ resourceType: 'Practitioner', id: practitioner.id as string })],
    });
  }

  async function createIncomingMessage(): Promise<void> {
    if (!(patient && practitioner)) {
      return;
    }
    await medplum.createResource<Communication>({
      resourceType: 'Communication',
      status: 'completed',
      sender: createReference({ resourceType: 'Practitioner', id: practitioner.id as string }),
      recipient: [createReference({ resourceType: 'Patient', id: patient.id as string })],
    });
  }

  function closeWebSocket(): void {
    if (!webSocket) {
      return;
    }
    webSocket.close();
    setWebSocket(undefined);
  }

  async function deleteSubscription(): Promise<void> {
    if (working || !subscription) {
      return;
    }

    setWorking(true);
    await medplum.deleteResource('Subscription', subscription.id as string);
    setSubscription(undefined);
    setPatient(undefined);
    setPractitioner(undefined);
    setWorking(false);
  }

  return (
    <Document>
      <Title>
        Welcome <ResourceName value={profile} link />
      </Title>
      <Group position="center" pt="xl">
        <Button
          onClick={!subscription ? () => createSubscription().catch(console.error) : undefined}
          disabled={working || !!subscription}
        >
          Create Subscription
        </Button>
        <Button
          onClick={subscription ? () => listenForSubs().catch(console.error) : undefined}
          disabled={working || !subscription || !!webSocket}
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
          onClick={subscription && !webSocket ? () => deleteSubscription().catch(console.error) : undefined}
          disabled={working || !subscription || !!webSocket}
          variant="outline"
        >
          Delete Subscription
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
