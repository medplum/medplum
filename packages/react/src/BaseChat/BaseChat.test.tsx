import { ProfileResource, createReference, getReferenceString } from '@medplum/core';
import { Bundle, Communication } from '@medplum/fhirtypes';
import { DrAliceSmith, HomerSimpson, MockClient } from '@medplum/mock';
// @ts-expect-error _subscriptionController is not exported from module normally
import { MedplumProvider, _subscriptionController } from '@medplum/react-hooks';
import crypto from 'node:crypto';
import { EventEmitter } from 'node:events';
import { useState } from 'react';
import { MemoryRouter } from 'react-router-dom';
import { act, fireEvent, render, screen } from '../test-utils/render';
import { BaseChat, BaseChatProps } from './BaseChat';

type TestComponentProps = Omit<Omit<BaseChatProps, 'communications'>, 'setCommunications'>;

const homerReference = createReference(HomerSimpson);
const homerReferenceStr = getReferenceString(homerReference);
const drAliceReference = createReference(DrAliceSmith);
const drAliceReferenceStr = getReferenceString(drAliceReference);
const HOMER_DR_ALICE_CHAT_QUERY = `sender=${homerReferenceStr},${drAliceReferenceStr}&recipient=${homerReferenceStr},${drAliceReferenceStr}`;

jest.mock('@medplum/react-hooks', () => {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const EventEmitter = require('node:events');
  const _subscriptionController = new EventEmitter();
  const original = jest.requireActual('@medplum/react-hooks'); // Step 2.
  return {
    ...original,
    useSubscription: jest.fn().mockImplementation((criteria: string, callback: (bundle: Bundle) => void) => {
      _subscriptionController.addListener('subscription', (_criteria: string, _bundle: Bundle) => {
        if (criteria === _criteria) {
          callback(_bundle);
        }
      });
    }),
    _subscriptionController,
  };
});

async function createCommunication(
  medplum: MockClient,
  communicationProps?: Partial<Communication>
): Promise<Communication> {
  const communication = {
    id: crypto.randomUUID(),
    resourceType: 'Communication',
    sender: createReference(medplum.getProfile() as ProfileResource),
    recipient: [drAliceReference],
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
  let medplum: MockClient;

  beforeAll(() => {
    medplum = new MockClient({ profile: HomerSimpson });
  });

  afterEach(() => {
    (_subscriptionController as EventEmitter).removeAllListeners();
  });

  function TestComponent(props: TestComponentProps): JSX.Element {
    const [communications, setCommunications] = useState<Communication[]>([]);
    return <BaseChat {...props} communications={communications} setCommunications={setCommunications} />;
  }

  async function setup(props: TestComponentProps): Promise<{ rerender: (props: TestComponentProps) => Promise<void> }> {
    const { rerender: _rerender } = await act(async () =>
      render(<TestComponent {...props} />, ({ children }) => (
        <MemoryRouter>
          <MedplumProvider medplum={medplum}>{children}</MedplumProvider>
        </MemoryRouter>
      ))
    );
    return {
      rerender: async (props: TestComponentProps) => {
        await act(async () => _rerender(<TestComponent {...props} />));
      },
    };
  }

  test('Setting `open` to `true`', async () => {
    const baseProps = { title: 'Test Chat', query: HOMER_DR_ALICE_CHAT_QUERY, sendMessage: () => undefined };

    const { rerender } = await setup({ ...baseProps });
    const openChatButton = screen.getByRole('button');
    expect(openChatButton).toBeInTheDocument();

    await rerender({ ...baseProps, open: true });
    expect(openChatButton).not.toBeInTheDocument();
    expect(screen.getByRole('textbox')).toBeInTheDocument();
  });

  test('Setting `open` to `false` then `true` then to `false` again', async () => {
    const baseProps = { title: 'Test Chat', query: HOMER_DR_ALICE_CHAT_QUERY, sendMessage: () => undefined };

    const { rerender } = await setup({ ...baseProps, open: false });
    const openChatButton = screen.getByRole('button');
    expect(openChatButton).toBeInTheDocument();

    screen.logTestingPlaygroundURL();

    await rerender({ ...baseProps, open: true });
    expect(openChatButton).not.toBeInTheDocument();
    expect(screen.getByPlaceholderText('Type a message...')).toBeInTheDocument();

    await rerender({ ...baseProps, open: false });
    expect(screen.getByRole('button')).toBeInTheDocument();
    expect(screen.queryByPlaceholderText('Type a message...')).not.toBeInTheDocument();
  });

  test('Setting `open` to `true` then `undefined`', async () => {
    const baseProps = { title: 'Test Chat', query: HOMER_DR_ALICE_CHAT_QUERY, sendMessage: () => undefined };

    const { rerender } = await setup({ ...baseProps, open: true });
    expect(screen.getByPlaceholderText('Type a message...')).toBeInTheDocument();

    await rerender({ ...baseProps, open: undefined });
    expect(screen.getByPlaceholderText('Type a message...')).toBeInTheDocument();
  });

  test('Clicking toggles chat open and closed', async () => {
    await setup({ title: 'Test Chat', query: HOMER_DR_ALICE_CHAT_QUERY, sendMessage: () => undefined });
    expect(screen.queryByPlaceholderText('Type a message...')).not.toBeInTheDocument();
    act(() => {
      fireEvent.click(screen.getByRole('button', { name: 'Open chat' }));
    });
    expect(screen.getByPlaceholderText('Type a message...')).toBeInTheDocument();
    act(() => {
      fireEvent.click(screen.getByRole('button', { name: 'Close chat' }));
    });
    expect(screen.queryByPlaceholderText('Type a message...')).not.toBeInTheDocument();
  });

  test('No initial messages', async () => {
    await setup({
      title: 'Test Chat',
      query: HOMER_DR_ALICE_CHAT_QUERY,
      sendMessage: () => undefined,
      open: true,
    });

    expect(screen.getByRole('heading', { name: /test chat/i })).toBeInTheDocument();
    expect(screen.queryByText('Hello, Medplum!')).not.toBeInTheDocument();

    const subBundle = await createCommunicationSubBundle(medplum);
    act(() => {
      _subscriptionController.emit('subscription', `Communication?${HOMER_DR_ALICE_CHAT_QUERY}`, subBundle);
    });

    expect(await screen.findByText('Hello, Medplum!')).toBeInTheDocument();
  });

  test('Chat loads initial messages and can receive new ones', async () => {
    await setup({
      title: 'Test Chat',
      query: HOMER_DR_ALICE_CHAT_QUERY,
      sendMessage: () => undefined,
      open: true,
    });
  });

  test('Sending a message', async () => {
    const sendMessage = jest.fn();

    await setup({
      title: 'Test Chat',
      query: HOMER_DR_ALICE_CHAT_QUERY,
      sendMessage,
      open: true,
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

  test('`onIncomingMessage` called on incoming message', async () => {
    const onIncomingMessage = jest.fn();

    await setup({
      title: 'Test Chat',
      query: HOMER_DR_ALICE_CHAT_QUERY,
      sendMessage: () => undefined,
      onIncomingMessage,
      open: true,
    });

    const incomingMessage = await createCommunication(medplum, {
      sender: drAliceReference,
      recipient: [homerReference],
      payload: [{ contentString: 'Homer, are you there?' }],
    });
    const subBundle = await createCommunicationSubBundle(medplum, incomingMessage);

    act(() => {
      _subscriptionController.emit('subscription', `Communication?${HOMER_DR_ALICE_CHAT_QUERY}`, subBundle);
    });

    expect(await screen.findByText('Homer, are you there?')).toBeInTheDocument();
    expect(onIncomingMessage).toHaveBeenCalledWith(incomingMessage);
  });

  test('`onIncomingMessage` not called on outgoing message', async () => {
    const onIncomingMessage = jest.fn();

    await setup({
      title: 'Test Chat',
      query: HOMER_DR_ALICE_CHAT_QUERY,
      sendMessage: () => undefined,
      onIncomingMessage,
      open: true,
    });

    const outgoingMessage = await createCommunication(medplum, {
      payload: [{ contentString: "Sorry, I'm not home! Come back later!" }],
    });
    const subBundle = await createCommunicationSubBundle(medplum, outgoingMessage);

    act(() => {
      _subscriptionController.emit('subscription', `Communication?${HOMER_DR_ALICE_CHAT_QUERY}`, subBundle);
    });

    expect(await screen.findByText("Sorry, I'm not home! Come back later!")).toBeInTheDocument();
    expect(onIncomingMessage).not.toHaveBeenCalled();
  });
});
