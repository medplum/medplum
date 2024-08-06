import { ProfileResource, TypedEventTarget, createReference, getReferenceString } from '@medplum/core';
import { Bundle, Communication, Reference } from '@medplum/fhirtypes';
import { BartSimpson, DrAliceSmith, HomerSimpson, MockClient } from '@medplum/mock';
// @ts-expect-error _subscriptionController is not exported from module normally
import { MedplumProvider, _subscriptionController } from '@medplum/react-hooks';
import crypto from 'node:crypto';
import { MemoryRouter } from 'react-router-dom';
import { act, fireEvent, render, screen } from '../../test-utils/render';
import { ThreadChat, ThreadChatProps } from './ThreadChat';

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
const drAliceReference = createReference(DrAliceSmith);
const bartReference = createReference(BartSimpson);

async function createThreadMessage(
  medplum: MockClient,
  threadRef: Reference<Communication>,
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
    partOf: [threadRef],
    ...communicationProps,
  } satisfies Communication;

  return medplum.createResource(communication);
}

async function createThreadHeader(
  medplum: MockClient,
  threadHeaderProps?: Partial<Communication>
): Promise<Communication> {
  const threadHeader = {
    id: crypto.randomUUID(),
    resourceType: 'Communication',
    recipient: [drAliceReference, homerReference],
    status: 'in-progress',
    ...threadHeaderProps,
  } satisfies Communication;

  return medplum.createResource(threadHeader);
}

async function createThreadMessageSubBundle(
  medplum: MockClient,
  threadRef: Reference<Communication>,
  communication?: Communication
): Promise<Bundle> {
  communication ??= await createThreadMessage(medplum, threadRef);
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

describe('ThreadChat', () => {
  let defaultMedplum: MockClient;
  let defaultThread: Communication;
  let defaultThreadRef: Reference<Communication>;

  beforeAll(async () => {
    defaultMedplum = new MockClient({ profile: DrAliceSmith });

    defaultThread = await createThreadHeader(defaultMedplum);
    defaultThreadRef = createReference(defaultThread);

    await Promise.all([
      createThreadMessage(defaultMedplum, defaultThreadRef, {
        payload: [{ contentString: 'Hello, Homer. How are you feeling?' }],
      }),
      createThreadMessage(defaultMedplum, defaultThreadRef, {
        sender: homerReference,
        recipient: [drAliceReference],
        payload: [
          {
            contentString: "Sorry doc, I can't hear you over the Geiger counter at the plant. Can you call back later?",
          },
        ],
      }),
    ]);
  });

  afterEach(() => {
    (_subscriptionController as TypedEventTarget<SubscriptionControllerEvents>).removeAllListeners();
  });

  async function setup(
    props: ThreadChatProps,
    medplum?: MockClient
  ): Promise<{ rerender: (props: ThreadChatProps) => Promise<void> }> {
    const { rerender: _rerender } = await act(async () =>
      render(<ThreadChat {...props} />, ({ children }) => (
        <MemoryRouter>
          <MedplumProvider medplum={medplum ?? defaultMedplum}>{children}</MedplumProvider>
        </MemoryRouter>
      ))
    );
    return {
      rerender: async (props: ThreadChatProps) => {
        await act(async () => _rerender(<ThreadChat {...props} />));
      },
    };
  }

  test('Displays existing and incoming thread messages', async () => {
    const threadProps = { title: 'Test Chat', thread: defaultThread } satisfies ThreadChatProps;
    await setup(threadProps, defaultMedplum);

    // Displays existing messages
    expect(screen.getByPlaceholderText('Type a message...')).toBeInTheDocument();
    expect(screen.getByText('Hello, Homer. How are you feeling?')).toBeInTheDocument();
    expect(
      screen.getByText("Sorry doc, I can't hear you over the Geiger counter at the plant. Can you call back later?")
    ).toBeInTheDocument();

    const message = await createThreadMessage(defaultMedplum, defaultThreadRef, {
      payload: [{ contentString: 'Homer, this is a text chat.' }],
    });
    const bundle = await createThreadMessageSubBundle(defaultMedplum, defaultThreadRef, message);

    act(() => {
      (_subscriptionController as TypedEventTarget<SubscriptionControllerEvents>).dispatchEvent({
        type: 'subscription',
        criteria: `Communication?part-of=${getReferenceString(defaultThread)}`,
        bundle,
      });
    });

    // Displays incoming message
    expect(screen.getByText('Homer, this is a text chat.')).toBeInTheDocument();
  });

  test('Add delivered timestamps when ONLY 2 participants', async () => {
    const thread = await createThreadHeader(defaultMedplum);
    const threadRef = createReference(thread);

    await Promise.all([
      createThreadMessage(defaultMedplum, threadRef, {
        payload: [{ contentString: 'Hello, Homer. How are you feeling?' }],
      }),
      createThreadMessage(defaultMedplum, threadRef, {
        sender: homerReference,
        recipient: [drAliceReference],
        payload: [
          {
            contentString: "Sorry doc, I can't hear you over the Geiger counter at the plant. Can you call back later?",
          },
        ],
      }),
    ]);

    const threadProps = { title: 'Test Chat', thread } satisfies ThreadChatProps;
    await setup(threadProps, defaultMedplum);

    // Displays existing messages
    expect(screen.getByPlaceholderText('Type a message...')).toBeInTheDocument();
    expect(screen.getByText('Hello, Homer. How are you feeling?')).toBeInTheDocument();
    expect(
      screen.getByText("Sorry doc, I can't hear you over the Geiger counter at the plant. Can you call back later?")
    ).toBeInTheDocument();

    const message = await createThreadMessage(defaultMedplum, threadRef, {
      sender: homerReference,
      recipient: [drAliceReference],
      payload: [{ contentString: "Doc, don't worry about me, I'm fine now. I had a donut and feel better" }],
    });
    expect(message.received).not.toBeDefined();

    const subBundle1 = await createThreadMessageSubBundle(defaultMedplum, threadRef, message);

    act(() => {
      (_subscriptionController as TypedEventTarget<SubscriptionControllerEvents>).dispatchEvent({
        type: 'subscription',
        criteria: `Communication?part-of=${getReferenceString(thread)}`,
        bundle: subBundle1,
      });
    });

    const updatedMessage = await defaultMedplum.readResource('Communication', message.id as string);
    expect(updatedMessage.received).toBeDefined();
    expect(updatedMessage.status).toEqual('completed');

    const subBundle2 = await createThreadMessageSubBundle(defaultMedplum, threadRef, updatedMessage);
    act(() => {
      (_subscriptionController as TypedEventTarget<SubscriptionControllerEvents>).dispatchEvent({
        type: 'subscription',
        criteria: `Communication?part-of=${getReferenceString(thread)}`,
        bundle: subBundle2,
      });
    });

    expect(
      screen.getByText("Doc, don't worry about me, I'm fine now. I had a donut and feel better")
    ).toBeInTheDocument();
  });

  test("Don't add delivered timestamps when MORE THAN 2 participants in chat", async () => {
    const thread = await createThreadHeader(defaultMedplum, {
      recipient: [homerReference, bartReference, drAliceReference],
    });
    const threadRef = createReference(thread);

    await Promise.all([
      createThreadMessage(defaultMedplum, threadRef, {
        recipient: [homerReference, bartReference],
        payload: [{ contentString: 'Hello, Homer. How are you feeling?' }],
      }),
      createThreadMessage(defaultMedplum, threadRef, {
        sender: homerReference,
        recipient: [drAliceReference, bartReference],
        payload: [
          {
            contentString: "Sorry doc, I can't hear you over the Geiger counter at the plant. Can you call back later?",
          },
        ],
      }),
    ]);

    const threadProps = { title: 'Test Chat', thread } satisfies ThreadChatProps;
    await setup(threadProps, defaultMedplum);

    // Displays existing messages
    expect(screen.getByPlaceholderText('Type a message...')).toBeInTheDocument();
    expect(screen.getByText('Hello, Homer. How are you feeling?')).toBeInTheDocument();
    expect(
      screen.getByText("Sorry doc, I can't hear you over the Geiger counter at the plant. Can you call back later?")
    ).toBeInTheDocument();

    const message = await createThreadMessage(defaultMedplum, threadRef, {
      sender: homerReference,
      recipient: [drAliceReference, bartReference],
      payload: [{ contentString: "Doc, don't worry about me, I'm fine now. I had a donut and feel better" }],
    });
    expect(message.received).not.toBeDefined();

    const bundle = await createThreadMessageSubBundle(defaultMedplum, threadRef, message);
    act(() => {
      (_subscriptionController as TypedEventTarget<SubscriptionControllerEvents>).dispatchEvent({
        type: 'subscription',
        criteria: `Communication?part-of=${getReferenceString(thread)}`,
        bundle,
      });
    });

    const updatedMessage = await defaultMedplum.readResource('Communication', message.id as string);
    expect(updatedMessage.received).not.toBeDefined();
    expect(updatedMessage.status).toEqual('in-progress');
  });

  test('Delivered timestamps show up when other participant has received chat', async () => {
    const thread = await createThreadHeader(defaultMedplum);
    const threadRef = createReference(thread);

    await Promise.all([
      createThreadMessage(defaultMedplum, threadRef, {
        payload: [{ contentString: 'Hello, Homer. How are you feeling?' }],
        received: new Date().toISOString(),
      }),
      createThreadMessage(defaultMedplum, threadRef, {
        sender: homerReference,
        recipient: [drAliceReference],
        payload: [
          {
            contentString: "Sorry doc, I can't hear you over the Geiger counter at the plant. Can you call back later?",
          },
        ],
      }),
    ]);

    const threadProps = { title: 'Test Chat', thread } satisfies ThreadChatProps;
    await setup(threadProps, defaultMedplum);

    expect(screen.getByPlaceholderText('Type a message...')).toBeInTheDocument();
    expect(screen.getByText('Hello, Homer. How are you feeling?')).toBeInTheDocument();
    expect(
      screen.getByText("Sorry doc, I can't hear you over the Geiger counter at the plant. Can you call back later?")
    ).toBeInTheDocument();
    expect(screen.getByText(/Delivered \d+:\d+/)).toBeInTheDocument();
  });

  test('Clears messages if given a new thread', async () => {
    const thread1 = await createThreadHeader(defaultMedplum);
    const thread1Ref = createReference(thread1);

    const thread2 = await createThreadHeader(defaultMedplum);
    const thread2Ref = createReference(thread2);

    await Promise.all([
      createThreadMessage(defaultMedplum, thread1Ref, {
        payload: [{ contentString: 'Hello, Homer. How are you feeling?' }],
      }),
      createThreadMessage(defaultMedplum, thread1Ref, {
        sender: homerReference,
        recipient: [drAliceReference],
        payload: [
          {
            contentString: "Sorry doc, I can't hear you over the Geiger counter at the plant. Can you call back later?",
          },
        ],
      }),
      createThreadMessage(defaultMedplum, thread2Ref, {
        recipient: [bartReference],
        payload: [{ contentString: 'Hi, Bart. How are you feeling now?' }],
      }),
      createThreadMessage(defaultMedplum, thread2Ref, {
        sender: bartReference,
        recipient: [drAliceReference],
        payload: [
          {
            contentString: 'Not so great, doc',
          },
        ],
      }),
    ]);

    const threadProps1 = { title: 'Test Chat', thread: thread1 } satisfies ThreadChatProps;
    const { rerender } = await setup(threadProps1, defaultMedplum);

    expect(screen.getByPlaceholderText('Type a message...')).toBeInTheDocument();
    expect(screen.getByText('Hello, Homer. How are you feeling?')).toBeInTheDocument();
    expect(
      screen.getByText("Sorry doc, I can't hear you over the Geiger counter at the plant. Can you call back later?")
    ).toBeInTheDocument();

    const threadProps2 = { title: 'Test Chat', thread: thread2 } satisfies ThreadChatProps;
    await rerender(threadProps2);

    expect(screen.getByPlaceholderText('Type a message...')).toBeInTheDocument();
    expect(screen.queryByText('Hello, Homer. How are you feeling?')).not.toBeInTheDocument();
    expect(
      screen.queryByText("Sorry doc, I can't hear you over the Geiger counter at the plant. Can you call back later?")
    ).not.toBeInTheDocument();
    expect(screen.getByText('Hi, Bart. How are you feeling now?')).toBeInTheDocument();
    expect(screen.getByText('Not so great, doc')).toBeInTheDocument();
  });

  test('Sending message', async () => {
    const thread = await createThreadHeader(defaultMedplum);
    const onMessageSent = jest.fn();

    const threadProps = {
      title: 'Test Chat',
      thread,
      onMessageSent,
    } satisfies ThreadChatProps;

    await setup(threadProps, defaultMedplum);
    const input = screen.getByPlaceholderText('Type a message...');
    expect(input).toBeInTheDocument();

    act(() => {
      fireEvent.change(input, { target: { value: 'Hey, Homer. How are you feeling?' } });
    });
    act(() => {
      fireEvent.click(screen.getByRole('button', { name: 'Send message' }));
    });

    expect(screen.getByPlaceholderText('Type a message...')).toHaveValue('');
    expect(await screen.findByText('Hey, Homer. How are you feeling?')).toBeInTheDocument();
    expect(onMessageSent).toHaveBeenCalledWith(
      expect.objectContaining<Communication>({
        resourceType: 'Communication',
        payload: [{ contentString: 'Hey, Homer. How are you feeling?' }],
        status: 'in-progress',
      })
    );
  });

  test('Not rendered when no profile', async () => {
    const medplum = new MockClient({ profile: null });
    const thread = await createThreadHeader(medplum);

    const threadProps = {
      title: 'Test Chat',
      thread,
    } satisfies ThreadChatProps;

    await setup(threadProps, medplum);
    expect(screen.queryByPlaceholderText('Type a message...')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Close chat' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Open chat' })).not.toBeInTheDocument();
  });

  test('Title passed in', async () => {
    await setup({ title: 'Testing the title', thread: defaultThread });
    expect(screen.getByText('Testing the title')).toBeInTheDocument();
    expect(screen.getByPlaceholderText('Type a message...')).toBeInTheDocument();
  });

  test('No title passed in', async () => {
    const thread = await createThreadHeader(defaultMedplum, { topic: { text: 'Test Topic' } });
    await setup({ thread });
    expect(screen.getByText('Test Topic')).toBeInTheDocument();
    expect(screen.getByPlaceholderText('Type a message...')).toBeInTheDocument();
  });

  test('No title passed in and no thread topic', async () => {
    await setup({ thread: defaultThread });
    expect(screen.getByText('[No thread title]')).toBeInTheDocument();
    expect(screen.getByPlaceholderText('Type a message...')).toBeInTheDocument();
  });

  test('inputDisabled', async () => {
    const threadProps = { thread: defaultThread };
    const { rerender } = await setup({ ...threadProps });
    expect(screen.getByPlaceholderText('Type a message...')).toBeInTheDocument();
    await rerender({ ...threadProps, inputDisabled: false });
    expect(screen.getByPlaceholderText('Type a message...')).toBeInTheDocument();
    await rerender({ ...threadProps, inputDisabled: true });
    expect(screen.queryByPlaceholderText('Type a message...')).not.toBeInTheDocument();
  });
});
