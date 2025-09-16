// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { Notifications } from '@mantine/notifications';
import {
  ProfileResource,
  createReference,
  generateId,
  getReferenceString,
  getWebSocketUrl,
  sleep,
} from '@medplum/core';
import { Bundle, Communication } from '@medplum/fhirtypes';
import { BartSimpson, DrAliceSmith, HomerSimpson, MockClient, MockSubscriptionManager } from '@medplum/mock';
import { MedplumProvider } from '@medplum/react-hooks';
import crypto from 'node:crypto';
import { JSX, useState } from 'react';
import { MemoryRouter } from 'react-router';
import { act, fireEvent, render, screen } from '../../test-utils/render';
import { BaseChat, BaseChatProps } from './BaseChat';

type TestComponentProps = Omit<Omit<BaseChatProps, 'communications'>, 'setCommunications'>;

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
  let defaultSubManager: MockSubscriptionManager;

  beforeEach(() => {
    defaultMedplum = new MockClient({ profile: DrAliceSmith });
    defaultSubManager = new MockSubscriptionManager(
      defaultMedplum,
      getWebSocketUrl(defaultMedplum.getBaseUrl(), '/ws/subscriptions-r4'),
      { mockReconnectingWebSocket: true }
    );
    defaultMedplum.setSubscriptionManager(defaultSubManager);
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
          <Notifications />
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
      defaultSubManager.emitEventForCriteria(`Communication?${HOMER_DR_ALICE_CHAT_QUERY}`, {
        type: 'message',
        payload: bundle,
      });
    });

    expect(await screen.findByText('Hello, Medplum!')).toBeInTheDocument();
  });

  test('Loads initial messages and can receive new ones', async () => {
    const medplum = new MockClient({ profile: HomerSimpson });
    medplum.setSubscriptionManager(defaultSubManager);
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
      defaultSubManager.emitEventForCriteria(`Communication?${HOMER_DR_ALICE_CHAT_QUERY}`, {
        type: 'message',
        payload: bundle,
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
      defaultSubManager.emitEventForCriteria(`Communication?${HOMER_DR_ALICE_CHAT_QUERY}`, {
        type: 'message',
        payload: bundle,
      });
    });

    expect(await screen.findByText("Doc, I can't feel my legs")).toBeInTheDocument();
    expect(onMessageReceived).toHaveBeenCalledWith(incomingMessage);
    expect(onMessageReceived).toHaveBeenCalledTimes(1);
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
      defaultSubManager.emitEventForCriteria(`Communication?${HOMER_DR_ALICE_CHAT_QUERY}`, {
        type: 'message',
        payload: bundle,
      });
    });

    expect(await screen.findByText('Homer, are you there?')).toBeInTheDocument();
    expect(onMessageReceived).not.toHaveBeenCalled();
  });

  test('`onMessageUpdated` called on incoming message update', async () => {
    const onMessageReceived = jest.fn();
    const onMessageUpdated = jest.fn();

    await setup({
      title: 'Test Chat',
      query: HOMER_DR_ALICE_CHAT_QUERY,
      sendMessage: () => undefined,
      onMessageReceived,
      onMessageUpdated,
    });

    const incomingMessage = await createCommunication(defaultMedplum, {
      sender: homerReference,
      recipient: [drAliceReference],
      payload: [{ contentString: "Doc, I can't feel my legs" }],
    });

    const bundle1 = await createCommunicationSubBundle(defaultMedplum, incomingMessage);
    act(() => {
      defaultSubManager.emitEventForCriteria(`Communication?${HOMER_DR_ALICE_CHAT_QUERY}`, {
        type: 'message',
        payload: bundle1,
      });
    });

    expect(await screen.findByText("Doc, I can't feel my legs")).toBeInTheDocument();
    expect(onMessageReceived).toHaveBeenCalledTimes(1);
    expect(onMessageUpdated).not.toHaveBeenCalled();

    const updatedMessage = await defaultMedplum.updateResource({
      ...incomingMessage,
      payload: [{ contentString: "Doc, I can't feel my arms" }],
    });

    const bundle2 = await createCommunicationSubBundle(defaultMedplum, updatedMessage);
    act(() => {
      defaultSubManager.emitEventForCriteria(`Communication?${HOMER_DR_ALICE_CHAT_QUERY}`, {
        type: 'message',
        payload: bundle2,
      });
    });

    expect(await screen.findByText("Doc, I can't feel my arms")).toBeInTheDocument();
    expect(onMessageUpdated).toHaveBeenCalledWith(updatedMessage);
    expect(onMessageUpdated).toHaveBeenCalledTimes(1);
    expect(onMessageReceived).toHaveBeenCalledTimes(1);
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

  test('excludeHeader', async () => {
    const baseProps = { title: 'Testing', query: HOMER_DR_ALICE_CHAT_QUERY, sendMessage: () => undefined };
    const { rerender } = await setup({ ...baseProps });
    expect(screen.getByRole('heading', { name: /testing/i })).toBeInTheDocument();
    await rerender({ ...baseProps, excludeHeader: false });
    expect(screen.getByRole('heading', { name: /testing/i })).toBeInTheDocument();
    await rerender({ ...baseProps, excludeHeader: true });
    expect(screen.queryByRole('heading', { name: /testing/i })).not.toBeInTheDocument();
  });

  test('Notifies user when disconnected and reconnected, refetches message after reconnect', async () => {
    const medplum = new MockClient({ profile: DrAliceSmith });
    medplum.setSubscriptionManager(defaultSubManager);

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

    await setup(baseProps, medplum);
    expect(screen.getAllByText('Hello, Medplum!').length).toEqual(2);
    expect(screen.getByText('Hello again!')).toBeInTheDocument();

    // Emulate disconnecting WebSocket
    act(() => {
      defaultSubManager.closeWebSocket();
    });

    // Check for the disconnected notification(s)
    await expect(
      screen.findByText(/live chat disconnected\. attempting to reconnect\.\.\./i)
    ).resolves.toBeInTheDocument();

    // While disconnected send a new message
    await createCommunication(medplum, {
      sender: drAliceReference,
      recipient: [homerReference],
      payload: [{ contentString: 'Homer please' }],
    });

    // Reconnect
    act(() => {
      defaultSubManager.openWebSocket();
    });

    // Check for the reconnected notification(s)
    await expect(screen.findByText(/live chat reconnected\./i)).resolves.toBeInTheDocument();

    // Message should not be in chat yet
    expect(screen.queryByText(/homer please/i)).not.toBeInTheDocument();

    // Emit that subscription is connected
    act(() => {
      defaultSubManager.emitEventForCriteria(`Communication?${HOMER_DR_ALICE_CHAT_QUERY}`, {
        type: 'connect',
        payload: { subscriptionId: generateId() },
      });
    });

    // Make sure the new message is fetched via search after subscription reconnects
    await expect(screen.findByText(/homer please/i)).resolves.toBeInTheDocument();
  });

  test('Displays an error notification when a subscription error occurs', async () => {
    const medplum = new MockClient({ profile: DrAliceSmith });
    medplum.setSubscriptionManager(defaultSubManager);

    const baseProps = {
      title: 'Test Chat',
      query: HOMER_DR_ALICE_CHAT_QUERY,
      sendMessage: () => undefined,
    };

    await Promise.all([
      createCommunication(medplum, { sender: drAliceReference, recipient: [homerReference] }),
      createCommunication(medplum),
      createCommunication(medplum, {
        sender: drAliceReference,
        recipient: [homerReference],
        payload: [{ contentString: 'Hello again!' }],
      }),
    ]);

    // Setup and check setup successful
    await setup(baseProps, medplum);
    expect(screen.getAllByText('Hello, Medplum!').length).toEqual(2);
    expect(screen.getByText('Hello again!')).toBeInTheDocument();

    // Emit error event on subscription
    act(() => {
      defaultSubManager.emitEventForCriteria(`Communication?${HOMER_DR_ALICE_CHAT_QUERY}`, {
        type: 'error',
        payload: new Error('Something is broken'),
      });
    });

    // Check for the reconnected notification(s)
    await expect(screen.findByText(/something is broken/i)).resolves.toBeInTheDocument();
  });

  test('Calls onError cb when `onError` is specified', async () => {
    const medplum = new MockClient({ profile: DrAliceSmith });
    medplum.setSubscriptionManager(defaultSubManager);

    const baseProps = {
      title: 'Test Chat',
      query: HOMER_DR_ALICE_CHAT_QUERY,
      sendMessage: () => undefined,
      onError: jest.fn(),
    };

    await Promise.all([
      createCommunication(medplum, { sender: drAliceReference, recipient: [homerReference] }),
      createCommunication(medplum),
      createCommunication(medplum, {
        sender: drAliceReference,
        recipient: [homerReference],
        payload: [{ contentString: 'Hello again!' }],
      }),
    ]);

    // Setup and check setup successful
    await setup(baseProps, medplum);
    expect(screen.getAllByText('Hello, Medplum!').length).toEqual(2);
    expect(screen.getByText('Hello again!')).toBeInTheDocument();

    // Emit error event on subscription
    act(() => {
      defaultSubManager.emitEventForCriteria(`Communication?${HOMER_DR_ALICE_CHAT_QUERY}`, {
        type: 'error',
        payload: new Error('Something is broken'),
      });
    });

    await sleep(500);
    expect(baseProps.onError).toHaveBeenCalledWith(new Error('Something is broken'));
  });

  test('Day sections are displayed when messages span multiple days', async () => {
    const medplum = new MockClient({ profile: DrAliceSmith });
    medplum.setSubscriptionManager(defaultSubManager);

    const today = new Date();
    const yesterday = new Date(today);
    yesterday.setDate(today.getDate() - 1);
    const twoDaysAgo = new Date(today);
    twoDaysAgo.setDate(today.getDate() - 2);

    await Promise.all([
      createCommunication(medplum, {
        sender: drAliceReference,
        recipient: [homerReference],
        sent: twoDaysAgo.toISOString(),
        payload: [{ contentString: 'Message from two days ago' }],
      }),
      createCommunication(medplum, {
        sender: homerReference,
        recipient: [drAliceReference],
        sent: yesterday.toISOString(),
        payload: [{ contentString: 'Message from yesterday' }],
      }),
      createCommunication(medplum, {
        sender: drAliceReference,
        recipient: [homerReference],
        sent: today.toISOString(),
        payload: [{ contentString: 'Message from today' }],
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

    expect(screen.getByText('Message from two days ago')).toBeInTheDocument();
    expect(screen.getByText('Message from yesterday')).toBeInTheDocument();
    expect(screen.getByText('Message from today')).toBeInTheDocument();

    const twoDaysAgoFormatted = twoDaysAgo.toLocaleDateString(undefined, {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    });
    const yesterdayFormatted = yesterday.toLocaleDateString(undefined, {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    });
    const todayFormatted = today.toLocaleDateString(undefined, {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    });

    expect(screen.getByText(twoDaysAgoFormatted)).toBeInTheDocument();
    expect(screen.getByText(yesterdayFormatted)).toBeInTheDocument();
    expect(screen.getByText(todayFormatted)).toBeInTheDocument();
  });

  test('Day sections are not duplicated for messages on the same day', async () => {
    const medplum = new MockClient({ profile: DrAliceSmith });
    medplum.setSubscriptionManager(defaultSubManager);

    const today = new Date();
    const todayMorning = new Date(today);
    todayMorning.setHours(9, 0, 0, 0);
    const todayAfternoon = new Date(today);
    todayAfternoon.setHours(15, 30, 0, 0);

    await Promise.all([
      createCommunication(medplum, {
        sender: drAliceReference,
        recipient: [homerReference],
        sent: todayMorning.toISOString(),
        payload: [{ contentString: 'Good morning!' }],
      }),
      createCommunication(medplum, {
        sender: homerReference,
        recipient: [drAliceReference],
        sent: todayAfternoon.toISOString(),
        payload: [{ contentString: 'Good afternoon!' }],
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

    expect(screen.getByText('Good morning!')).toBeInTheDocument();
    expect(screen.getByText('Good afternoon!')).toBeInTheDocument();

    const todayFormatted = today.toLocaleDateString(undefined, {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    });

    const daySections = screen.getAllByText(todayFormatted);
    expect(daySections).toHaveLength(1);
  });

  test('Scrolls to bottom when new messages arrive', async () => {
    const medplum = new MockClient({ profile: DrAliceSmith });
    medplum.setSubscriptionManager(defaultSubManager);

    const mockScrollTo = jest.fn();
    Object.defineProperty(HTMLElement.prototype, 'scrollTo', {
      value: mockScrollTo,
      writable: true,
    });

    Object.defineProperty(HTMLElement.prototype, 'scrollHeight', {
      value: 1000,
      configurable: true,
    });

    await createCommunication(medplum, {
      sender: drAliceReference,
      recipient: [homerReference],
      payload: [{ contentString: 'Initial message' }],
    });

    await setup(
      {
        title: 'Test Chat',
        query: HOMER_DR_ALICE_CHAT_QUERY,
        sendMessage: () => undefined,
      },
      medplum
    );

    expect(await screen.findByText('Initial message')).toBeInTheDocument();

    await act(async () => {
      await sleep(100);
    });

    mockScrollTo.mockClear();

    const newMessage = await createCommunication(medplum, {
      sender: homerReference,
      recipient: [drAliceReference],
      payload: [{ contentString: 'New message triggers scroll!' }],
    });

    const bundle = await createCommunicationSubBundle(medplum, newMessage);
    act(() => {
      defaultSubManager.emitEventForCriteria(`Communication?${HOMER_DR_ALICE_CHAT_QUERY}`, {
        type: 'message',
        payload: bundle,
      });
    });

    expect(await screen.findByText('New message triggers scroll!')).toBeInTheDocument();

    await act(async () => {
      await sleep(100);
    });

    expect(mockScrollTo).toHaveBeenCalled();

    const lastCall = mockScrollTo.mock.calls[mockScrollTo.mock.calls.length - 1];
    expect(lastCall[0]).toEqual(
      expect.objectContaining({
        top: expect.any(Number),
      })
    );
  });

  test('BaseChat returns null when profile is null', async () => {
    const medplum = new MockClient({ profile: null });
    medplum.setSubscriptionManager(defaultSubManager);

    await setup(
      {
        title: 'Test Chat',
        query: HOMER_DR_ALICE_CHAT_QUERY,
        sendMessage: () => undefined,
      },
      medplum
    );

    expect(screen.queryByRole('heading', { name: /test chat/i })).not.toBeInTheDocument();
    expect(screen.queryByPlaceholderText('Type a message...')).not.toBeInTheDocument();
    expect(screen.queryByText('Hello, Medplum!')).not.toBeInTheDocument();
  });

  test('BaseChat handles multiple communications with undefined sent date via subscription', async () => {
    const medplum = new MockClient({ profile: DrAliceSmith });
    medplum.setSubscriptionManager(defaultSubManager);

    await createCommunication(medplum, {
      sender: drAliceReference,
      recipient: [homerReference],
      payload: [{ contentString: 'Normal message' }],
    });

    await setup(
      {
        title: 'Test Chat',
        query: HOMER_DR_ALICE_CHAT_QUERY,
        sendMessage: () => undefined,
      },
      medplum
    );

    expect(await screen.findByText('Normal message')).toBeInTheDocument();

    const communicationsWithUndefinedSent = [
      {
        id: generateId(),
        resourceType: 'Communication',
        sender: homerReference,
        recipient: [drAliceReference],
        sent: undefined,
        status: 'in-progress',
        payload: [{ contentString: 'First message with no sent date' }],
      },
      {
        id: generateId(),
        resourceType: 'Communication',
        sender: drAliceReference,
        recipient: [homerReference],
        sent: undefined,
        status: 'in-progress',
        payload: [{ contentString: 'Second message with no sent date' }],
      },
      {
        id: generateId(),
        resourceType: 'Communication',
        sender: homerReference,
        recipient: [drAliceReference],
        sent: undefined,
        status: 'in-progress',
        payload: [{ contentString: 'Third message with no sent date' }],
      },
    ] as Communication[];

    for (const communication of communicationsWithUndefinedSent) {
      const bundle = await createCommunicationSubBundle(medplum, communication);
      act(() => {
        defaultSubManager.emitEventForCriteria(`Communication?${HOMER_DR_ALICE_CHAT_QUERY}`, {
          type: 'message',
          payload: bundle,
        });
      });
    }

    expect(await screen.findByText('First message with no sent date')).toBeInTheDocument();
    expect(screen.getByText('Second message with no sent date')).toBeInTheDocument();
    expect(screen.getByText('Third message with no sent date')).toBeInTheDocument();
  });
});
