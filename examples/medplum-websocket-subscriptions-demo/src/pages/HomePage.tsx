import { Accordion, Button, Group, Title } from '@mantine/core';
import { createReference, getReferenceString } from '@medplum/core';
import { Bundle, Communication, Parameters, Patient, Practitioner, Subscription } from '@medplum/fhirtypes';
import { HomerSimpson, MargeSimpson } from '@medplum/mock';
import { Document, ResourceName, useMedplum, useMedplumProfile } from '@medplum/react';
import { useState } from 'react';
import { BundleDisplay } from '../components/BundleDisplay';

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
  const [patient, setPatient] = useState<Patient | undefined>();
  const [anotherPatient, setAnotherPatient] = useState<Patient | undefined>();

  async function createSubscriptions(): Promise<void> {
    if (working) {
      return;
    }

    setWorking(true);

    const homer = await medplum.createResourceIfNoneExist(HomerSimpson, 'name="Homer Simpson"');
    const marge = await medplum.createResourceIfNoneExist(MargeSimpson, 'name="Marge Simpson"');

    const meRefString = getReferenceString(profile);
    const homerRefString = getReferenceString(homer);

    const subscription1 = await medplum.createResource<Subscription>({
      resourceType: 'Subscription',
      criteria: `Communication?_compartment=${homerRefString}&recipient=${meRefString}`,
      status: 'active',
      reason: `Watch for outgoing Communications for ${homerRefString} to ${meRefString}.`,
      channel: {
        type: 'websocket',
      },
    });
    const subscription2 = await medplum.createResource<Subscription>({
      resourceType: 'Subscription',
      criteria: `Communication?_compartment=${homerRefString}&sender=${meRefString}`,
      status: 'active',
      reason: `Watch for incoming Communications from ${meRefString} to ${homerRefString}.`,
      channel: {
        type: 'websocket',
      },
    });

    setSubscriptions([subscription1, subscription2]);
    setPatient(homer);
    setAnotherPatient(marge);
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
      const { parameter } = (await medplum.get(
        `/fhir/R4/Subscription/${subscription.id}/$get-ws-binding-token`
      )) as Parameters;
      const token = parameter?.find((param) => param.name === 'token')?.valueString;
      if (!url) {
        url = parameter?.find((param) => param.name === 'websocket-url')?.valueUrl;
      }
      if (!token) {
        throw new Error('Failed to get token!');
      }
      tokens.push(token);
    }

    if (!url) {
      throw new Error('Failed to get URL from $get-ws-binding-token!');
    }

    const ws = new WebSocket(url);

    ws.addEventListener('open', () => {
      for (const token of tokens) {
        ws.send(JSON.stringify({ type: 'bind-with-token', payload: { token } }));
      }
    });

    ws.addEventListener('message', (event: MessageEvent<string>) => {
      const bundle = JSON.parse(event.data) as Bundle;

      const firstResource = bundle.entry?.[0]?.resource;
      if (firstResource?.resourceType === 'SubscriptionStatus' && firstResource.type === 'heartbeat') {
        // Ignore heartbeat bundles
        return;
      }

      setBundles((s) => [bundle, ...s]);
    });

    setWebSocket(ws);
    setWorking(false);
  }

  async function createOutgoingMessage(): Promise<void> {
    if (!patient) {
      return;
    }
    await medplum.createResource<Communication>({
      resourceType: 'Communication',
      status: 'in-progress',
      sender: createReference(profile),
      recipient: [createReference(patient)],
      payload: [{ contentString: 'Can you come in tomorrow for a follow-up?' }],
      sent: new Date().toISOString(),
    });
  }

  async function createIncomingMessage(): Promise<void> {
    if (!patient) {
      return;
    }
    await medplum.createResource<Communication>({
      resourceType: 'Communication',
      status: 'in-progress',
      sender: createReference(patient),
      recipient: [createReference(profile)],
      payload: [{ contentString: "I'm not feeling great, and not sure if the medicine is working" }],
      sent: new Date().toISOString(),
    });
  }

  // Use: to prove that we are not receiving Subscriptions for
  // Important when tweaking criteria with advanced queries, such as the inclusion of `_filter` expressions
  // How can we make this more natural in this example?
  async function createMessageForAnotherPatient(): Promise<void> {
    if (!anotherPatient) {
      return;
    }
    await medplum.createResource<Communication>({
      resourceType: 'Communication',
      status: 'in-progress',
      sender: createReference(profile),
      recipient: [createReference(anotherPatient)],
      payload: [{ contentString: 'Are you going to be able to make it to your appointment today?' }],
      sent: new Date().toISOString(),
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
    setPatient(undefined);
    setWorking(false);
  }

  return (
    <Document>
      <Title>
        Welcome <ResourceName value={profile} link />
      </Title>
      <Group justify="center" pt="xl">
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
        <Button
          onClick={webSocket ? () => createMessageForAnotherPatient().catch(console.error) : undefined}
          disabled={working || !webSocket}
        >
          Create Message for Another Patient
        </Button>
      </Group>
      <Group justify="center" pt="xl">
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
