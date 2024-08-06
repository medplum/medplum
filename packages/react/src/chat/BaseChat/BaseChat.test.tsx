import { ProfileResource, TypedEventTarget, createReference, getReferenceString } from '@medplum/core';
import { Bundle, Communication } from '@medplum/fhirtypes';
import { BartSimpson, DrAliceSmith, HomerSimpson, MockClient } from '@medplum/mock';
// @ts-expect-error _subscriptionController is not exported from module normally
import { MedplumProvider, _subscriptionController } from '@medplum/react-hooks';
import crypto from 'node:crypto';
import { useState } from 'react';
import { MemoryRouter } from 'react-router-dom';
import { act, fireEvent, render, screen } from '../../test-utils/render';
import { BaseChat, BaseChatProps } from './BaseChat';

type TestComponentProps = Omit<Omit<BaseChatProps, 'communications'>, 'setCommunications'>;
type SubscriptionControllerEvents = {
  subscription: { type: 'subscription'; criteria: string; bundle: Bundle };
};

jest.mock('@medplum/react-hooks', () => {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { TypedEventTarget } = require('@medplum/core');
  const _subscriptionController = new TypedEventTarget() as TypedEventTarget<SubscriptionControllerEvents>;
  const original = jest.requireActual('@medplum/react-hooks');
  return {
    ...original,
    useSubscription: jest.fn().mockImplementation((criteria: string, callback: (bundle: Bundle) => void) => {
      _subscriptionController.addEventListener('subscription', (event) => {
        if (criteria === event.criteria) {
          callback(event.bundle);
        }
      });
    }),
    _subscriptionController,
  };
});

const homerReference = createReference(HomerSimpson);
const homerReferenceStr = getReferenceString(homerReference);
const drAliceReference = createReference(DrAliceSmith);
const drAliceReferenceStr = getReferenceString(drAliceReference);
const HOMER_DR_ALICE_CHAT_QUERY = `sender=${homerReferenceStr},${drAliceReferenceStr}&recipient=${homerReferenceStr},${drAliceReferenceStr}`;

async function createCommunication(
  medplum: MockClient,
  communicationProps?: Partial<Communication>
): Promise<Communication> {
  const communication = {
    id: crypto.randomUUID(),
    resourceType: 'Communication',
    sender: createReference(medplum.getProfile() as ProfileResource),
    recipient: [homerReference],
    sent: new Date().toISOString(),
    status: 'in-progress',
    payload: [{ contentString: 'Hello, Medplum!' }],
    ...communicationProps,
  } satisfies Communication;

  return medplum.createResource(communication);
}

async function createCommunicationSubBundle(medplum: MockClient, communication?: Communication): Promise<Bundle> {
  communication ??= await createCommunication(medplum);
  return {
    id: crypto.randomUUID(),
    resourceType: 'Bundle',
    type: 'history',
    timestamp: new Date().toISOString(),
    entry: [
      {
        resource: {
          id: crypto.randomUUID(),
          resourceType: 'SubscriptionStatus',
          status: 'active',
          type: 'event-notification',
          subscription: { reference: 'Subscription/abc123' },
          notificationEvent: [
            {
              eventNumber: '0',
              timestamp: new Date().toISOString(),
              focus: createReference(communication),
            },
          ],
        },
      },
      {
        resource: communication,
        fullUrl: `https://api.medplum.com/fhir/R4/Communication/${communication.id as string}`,
      },
    ],
  };
}

describe('BaseChat', () => {
  let defaultMedplum: MockClient;

  beforeAll(() => {
    defaultMedplum = new MockClient({ profile: DrAliceSmith });
  });

  afterEach(() => {
    (_subscriptionController as TypedEventTarget<SubscriptionControllerEvents>).removeAllListeners();
  });

  function TestComponent(props: TestComponentProps): JSX.Element | null {
    const [communications, setCommunications] = useState<Communication[]>([]);
    return <BaseChat {...props} communications={communications} setCommunications={setCommunications} />;
  }

  async function setup(
    props: TestComponentProps,
    medplum?: MockClient
  ): Promise<{ rerender: (props: TestComponentProps) => Promise<void> }> {
    const { rerender: _rerender } = await act(async () =>
      render(<TestComponent {...props} />, ({ children }) => (
        <MemoryRouter>
          <MedplumProvider medplum={medplum ?? defaultMedplum}>{children}</MedplumProvider>
        </MemoryRouter>
      ))
    );
    return {
      rerender: async (props: TestComponentProps) => {
        await act(async () => _rerender(<TestComponent {...props} />));
      },
    };
  }

  test('No initial messages', async () => {
    await setup({
      title: 'Test Chat',
      query: HOMER_DR_ALICE_CHAT_QUERY,
      sendMessage: () => undefined,
    });

    expect(screen.getByRole('heading', { name: /test chat/i })).toBeInTheDocument();
    expect(screen.queryByText('Hello, Medplum!')).not.toBeInTheDocument();

    const bundle = await createCommunicationSubBundle(defaultMedplum);
    act(() => {
      (_subscriptionController as TypedEventTarget<SubscriptionControllerEvents>).dispatchEvent({
        type: 'subscription',
        criteria: `Communication?${HOMER_DR_ALICE_CHAT_QUERY}`,
        bundle,
      });
    });

    expect(await screen.findByText('Hello, Medplum!')).toBeInTheDocument();
  });

  test('Loads initial messages and can receive new ones', async () => {
    const medplum = new MockClient({ profile: HomerSimpson });
    await Promise.all([
      createCommunication(medplum, { sender: drAliceReference, recipient: [homerReference] }),
      createCommunication(medplum),
      createCommunication(medplum, {
        sender: drAliceReference,
        recipient: [homerReference],
        payload: [{ contentString: 'Hello again!' }],
      }),
    ]);
    await setup(
      {
        title: 'Test Chat',
        query: HOMER_DR_ALICE_CHAT_QUERY,
        sendMessage: () => undefined,
      },
      medplum
    );
    expect(screen.getAllByText('Hello, Medplum!').length).toEqual(2);
    expect(screen.getByText('Hello again!')).toBeInTheDocument();

    const bundle = await createCommunicationSubBundle(medplum);
    act(() => {
      (_subscriptionController as TypedEventTarget<SubscriptionControllerEvents>).dispatchEvent({
        type: 'subscription',
        criteria: `Communication?${HOMER_DR_ALICE_CHAT_QUERY}`,
        bundle,
      });
    });

    expect(screen.getAllByText('Hello, Medplum!').length).toEqual(3);
    expect(screen.getByText('Hello again!')).toBeInTheDocument();
  });

  test('Sending a message', async () => {
    const sendMessage = jest.fn();

    await setup({
      title: 'Test Chat',
      query: HOMER_DR_ALICE_CHAT_QUERY,
      sendMessage,
    });

    const chatInput = screen.getByPlaceholderText('Type a message...') as HTMLInputElement;
    expect(chatInput).toBeInTheDocument();
    act(() => {
      fireEvent.change(chatInput, { target: { value: "Doc, I can't feel my legs!" } });
    });
    act(() => {
      fireEvent.click(screen.getByRole('button', { name: /send message/i }));
    });
    expect(sendMessage).toHaveBeenLastCalledWith("Doc, I can't feel my legs!");
  });

  test('`onMessageReceived` called on incoming message', async () => {
    const onMessageReceived = jest.fn();

    await setup({
      title: 'Test Chat',
      query: HOMER_DR_ALICE_CHAT_QUERY,
      sendMessage: () => undefined,
      onMessageReceived,
    });

    const incomingMessage = await createCommunication(defaultMedplum, {
      sender: homerReference,
      recipient: [drAliceReference],
      payload: [{ contentString: "Doc, I can't feel my legs" }],
    });

    const bundle = await createCommunicationSubBundle(defaultMedplum, incomingMessage);
    act(() => {
      (_subscriptionController as TypedEventTarget<SubscriptionControllerEvents>).dispatchEvent({
        type: 'subscription',
        criteria: `Communication?${HOMER_DR_ALICE_CHAT_QUERY}`,
        bundle,
      });
    });

    expect(await screen.findByText("Doc, I can't feel my legs")).toBeInTheDocument();
    expect(onMessageReceived).toHaveBeenCalledWith(incomingMessage);
  });

  test('`onMessageReceived` not called on outgoing message', async () => {
    const onMessageReceived = jest.fn();

    await setup({
      title: 'Test Chat',
      query: HOMER_DR_ALICE_CHAT_QUERY,
      sendMessage: () => undefined,
      onMessageReceived,
    });

    const outgoingMessage = await createCommunication(defaultMedplum, {
      payload: [{ contentString: 'Homer, are you there?' }],
    });

    const bundle = await createCommunicationSubBundle(defaultMedplum, outgoingMessage);
    act(() => {
      (_subscriptionController as TypedEventTarget<SubscriptionControllerEvents>).dispatchEvent({
        type: 'subscription',
        criteria: `Communication?${HOMER_DR_ALICE_CHAT_QUERY}`,
        bundle,
      });
    });

    expect(await screen.findByText('Homer, are you there?')).toBeInTheDocument();
    expect(onMessageReceived).not.toHaveBeenCalled();
  });

  test('Messages cleared if profile changes', async () => {
    const medplum = new MockClient({ profile: DrAliceSmith });
    await Promise.all([
      createCommunication(medplum, { sender: drAliceReference, recipient: [homerReference] }),
      createCommunication(medplum),
      createCommunication(medplum, {
        sender: drAliceReference,
        recipient: [homerReference],
        payload: [{ contentString: 'Hello again!' }],
      }),
    ]);

    const baseProps = {
      title: 'Test Chat',
      query: HOMER_DR_ALICE_CHAT_QUERY,
      sendMessage: () => undefined,
    };

    const { rerender } = await setup(baseProps, medplum);
    expect(screen.getAllByText('Hello, Medplum!').length).toEqual(2);
    expect(screen.getByText('Hello again!')).toBeInTheDocument();

    await act(async () => {
      medplum.setProfile(BartSimpson);
      await rerender(baseProps);
    });

    expect(screen.queryAllByText('Hello, Medplum!')?.length).toEqual(0);
    expect(screen.queryByText('Hello again!')).not.toBeInTheDocument();
  });

  test('inputDisabled', async () => {
    const baseProps = { title: 'Testing', query: HOMER_DR_ALICE_CHAT_QUERY, sendMessage: () => undefined };
    const { rerender } = await setup({ ...baseProps });
    expect(screen.getByPlaceholderText('Type a message...')).toBeInTheDocument();
    await rerender({ ...baseProps, inputDisabled: false });
    expect(screen.getByPlaceholderText('Type a message...')).toBeInTheDocument();
    await rerender({ ...baseProps, inputDisabled: true });
    expect(screen.queryByPlaceholderText('Type a message...')).not.toBeInTheDocument();
  });
});
