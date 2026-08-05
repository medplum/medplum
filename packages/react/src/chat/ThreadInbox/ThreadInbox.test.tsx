// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { Notifications } from '@mantine/notifications';
import type { Communication } from '@medplum/fhirtypes';
import { HomerSimpson, MockClient } from '@medplum/mock';
import * as reactHooks from '@medplum/react-hooks';
import { MedplumProvider } from '@medplum/react-hooks';
import type { JSX } from 'react';
import { act, render, screen, userEvent, waitFor } from '../../test-utils/render';
import { ThreadInbox } from './ThreadInbox';

vi.mock(import('@medplum/react-hooks'), async (importOriginal) => ({
  ...(await importOriginal()),
  useSubscription: vi.fn(),
}));

const mockCommunication: Communication | undefined = {
  resourceType: 'Communication',
  id: 'comm-123',
  status: 'in-progress',
  topic: { text: 'Test Topic' },
  subject: { reference: `Patient/${HomerSimpson.id}` },
};

const mockOnNew = vi.fn();
const mockOnSelectFirst = vi.fn();
const mockGetThreadUri = vi.fn((topic: Communication) => `/Message/${topic.id}`);
const mockOnChange = vi.fn();
const mockNavigate = vi.fn();

describe('ThreadInbox', () => {
  let medplum: MockClient;

  beforeEach(async () => {
    medplum = new MockClient();
    vi.clearAllMocks();
    vi.mocked(reactHooks.useSubscription).mockClear();
    mockNavigate.mockClear();

    medplum.search = vi.fn().mockResolvedValue({
      resourceType: 'Bundle',
      type: 'searchset',
      total: 0,
      entry: [],
    });
    medplum.graphql = vi.fn().mockResolvedValue({
      data: { CommunicationList: [] },
    });
  });

  const setup = async (props?: {
    threadId?: string;
    showPatientSummary?: boolean;
    subject?: typeof HomerSimpson;
    newTopicOpened?: boolean;
    onNewTopicOpen?: () => void;
    onNewTopicClose?: () => void;
  }): Promise<void> => {
    await act(async () => {
      render(
        <>
          <Notifications />
          <ThreadInbox
            query="_sort=-_lastUpdated"
            threadId={props?.threadId}
            showPatientSummary={props?.showPatientSummary ?? false}
            subject={props?.subject}
            onNew={mockOnNew}
            onSelectFirst={mockOnSelectFirst}
            getThreadUri={mockGetThreadUri}
            onChange={mockOnChange}
            inProgressUri="/Communication?status=in-progress"
            completedUri="/Communication?status=completed"
            newTopicOpened={props?.newTopicOpened}
            onNewTopicOpen={props?.onNewTopicOpen}
            onNewTopicClose={props?.onNewTopicClose}
          />
        </>,
        ({ children }) => (
          <MedplumProvider medplum={medplum} navigate={mockNavigate}>
            {children}
          </MedplumProvider>
        )
      );

      await Promise.resolve();
    });
  };

  test('renders filter buttons and new message button', async () => {
    await setup();
    expect(screen.getByText('In Progress')).toBeInTheDocument();
    expect(screen.getByText('Completed')).toBeInTheDocument();
    const iconButtons = screen.getAllByRole('button', { name: '' });
    expect(iconButtons.length).toBeGreaterThanOrEqual(2);
  });

  test('renders status filter buttons', async () => {
    await setup();
    expect(screen.getByText('In Progress')).toBeInTheDocument();
    expect(screen.getByText('Completed')).toBeInTheDocument();
  });

  test('shows loading skeletons when loading', async () => {
    medplum.search = vi.fn().mockImplementation(() => new Promise(() => {}));
    await setup();

    await waitFor(() => {
      const skeletons = document.querySelectorAll('.mantine-Skeleton-root');
      expect(skeletons.length).toBeGreaterThan(0);
    });
  });

  test('shows chat list with multiple communications and displays their topics', async () => {
    const communications: Communication[] = [
      {
        resourceType: 'Communication',
        id: 'comm-1',
        status: 'in-progress',
        topic: { text: 'Topic Alpha' },
        subject: { reference: `Patient/${HomerSimpson.id}` },
        meta: { lastUpdated: '2024-01-01T10:00:00Z' },
      },
      {
        resourceType: 'Communication',
        id: 'comm-2',
        status: 'in-progress',
        topic: { text: 'Topic Beta' },
        subject: { reference: `Patient/${HomerSimpson.id}` },
        meta: { lastUpdated: '2024-01-01T11:00:00Z' },
      },
      {
        resourceType: 'Communication',
        id: 'comm-3',
        status: 'completed',
        topic: { text: 'Topic Gamma' },
        subject: { reference: `Patient/${HomerSimpson.id}` },
        meta: { lastUpdated: '2024-01-01T12:00:00Z' },
      },
    ];

    for (const comm of communications) {
      await medplum.createResource(comm);
    }

    const lastMessages: Communication[] = communications.map((comm, index) => ({
      resourceType: 'Communication',
      id: `last-${comm.id}`,
      status: 'in-progress',
      partOf: [{ reference: `Communication/${comm.id}` }],
      sent: `2024-01-01T${12 + index}:00:00Z`,
      payload: [{ contentString: `Last message for ${comm.topic?.text}` }],
      meta: { lastUpdated: `2024-01-01T${12 + index}:00:00Z` },
      sender: { display: 'Test Sender', reference: 'Practitioner/test' },
    }));

    for (const msg of lastMessages) {
      await medplum.createResource(msg);
    }

    vi.spyOn(medplum, 'search').mockResolvedValue({
      resourceType: 'Bundle',
      type: 'searchset',
      total: 2,
      entry: [{ resource: communications[0] }, { resource: communications[1] }],
    } as any);

    vi.spyOn(medplum, 'graphql').mockImplementation(() =>
      Promise.resolve({
        data: {
          thread_comm1: [lastMessages[0]],
          thread_comm2: [lastMessages[1]],
        },
      })
    );

    await setup();

    await waitFor(
      () => {
        expect(screen.getByText('Topic Alpha')).toBeInTheDocument();
        expect(screen.getByText('Topic Beta')).toBeInTheDocument();
      },
      { timeout: 3000 }
    );
  });

  test('shows no messages state when no thread is selected', async () => {
    await setup();
    await waitFor(() => {
      expect(screen.getByText('Select a message from the list to view details')).toBeInTheDocument();
    });
  });

  test('fires onSelectFirst with the first thread when none is selected', async () => {
    const thread: Communication = {
      resourceType: 'Communication',
      id: 'comm-first',
      status: 'in-progress',
      topic: { text: 'First Topic' },
      subject: { reference: `Patient/${HomerSimpson.id}` },
    };
    const reply: Communication = {
      resourceType: 'Communication',
      id: 'reply-first',
      status: 'in-progress',
      partOf: [{ reference: 'Communication/comm-first' }],
      sent: '2024-01-01T10:00:00Z',
      payload: [{ contentString: 'Hello' }],
    };

    medplum.search = vi.fn().mockResolvedValue({
      resourceType: 'Bundle',
      type: 'searchset',
      total: 1,
      entry: [{ resource: thread }],
    });
    medplum.graphql = vi.fn().mockResolvedValue({ data: { thread_commfirst: [reply] } });

    await setup();

    await waitFor(() => expect(mockOnSelectFirst).toHaveBeenCalledWith(expect.objectContaining({ id: 'comm-first' })));
  });

  test('shows empty messages state when no messages are found', async () => {
    await setup();
    await waitFor(
      () => {
        expect(screen.getByText('No messages found')).toBeInTheDocument();
      },
      { timeout: 3000 }
    );
  });

  test('shows thread chat when thread is selected', async () => {
    await medplum.createResource(mockCommunication);

    medplum.search = vi.fn().mockResolvedValue({
      resourceType: 'Bundle',
      type: 'searchset',
      entry: [{ resource: mockCommunication }],
    });
    medplum.graphql = vi.fn().mockResolvedValue({ data: { CommunicationList: [] } });

    await setup({ threadId: 'comm-123' });

    await waitFor(
      () => {
        const topicTexts = screen.getAllByText('Test Topic');
        expect(topicTexts.length).toBeGreaterThan(0);
      },
      { timeout: 3000 }
    );

    expect(vi.mocked(reactHooks.useSubscription)).toHaveBeenCalled();
  });

  test('opens the Message Settings dialog from the thread header and saves', async () => {
    const user = userEvent.setup();
    // A Practitioner sender lets the dialog's fallback populate the practitioner field, so Save is enabled.
    const thread: Communication = {
      ...mockCommunication,
      sender: { reference: 'Practitioner/123' },
    };
    await medplum.createResource(thread);

    medplum.search = vi.fn().mockResolvedValue({
      resourceType: 'Bundle',
      type: 'searchset',
      entry: [{ resource: thread }],
    });
    medplum.graphql = vi.fn().mockResolvedValue({ data: { CommunicationList: [] } });
    const updateSpy = vi.spyOn(medplum, 'updateResource');

    await setup({ threadId: 'comm-123' });

    await waitFor(() => expect(screen.getAllByText('Test Topic').length).toBeGreaterThan(0), { timeout: 3000 });

    await user.click(screen.getByRole('button', { name: 'Message settings' }));
    await waitFor(() => expect(screen.getByText('Message Settings')).toBeInTheDocument());

    const saveButton = screen.getByRole('button', { name: 'Save' });
    await waitFor(() => expect(saveButton).toBeEnabled());
    await user.click(saveButton);

    // Saving calls onSaved -> refreshThreadMessages and closes the dialog.
    await waitFor(() => expect(updateSpy).toHaveBeenCalled());
    await waitFor(() => expect(screen.queryByText('Message Settings')).not.toBeInTheDocument());
  });

  test('hides Message Settings for a draft thread with no reply yet', async () => {
    const user = userEvent.setup();

    const ui = (threadId: string | undefined, newTopicOpened: boolean): JSX.Element => (
      <>
        <Notifications />
        <ThreadInbox
          query="_sort=-_lastUpdated"
          threadId={threadId}
          showPatientSummary={false}
          subject={HomerSimpson}
          onNew={mockOnNew}
          getThreadUri={mockGetThreadUri}
          onChange={mockOnChange}
          inProgressUri="/Communication?status=in-progress"
          completedUri="/Communication?status=completed"
          newTopicOpened={newTopicOpened}
        />
      </>
    );

    const { rerender } = render(ui(undefined, true), ({ children }) => (
      <MedplumProvider medplum={medplum} navigate={mockNavigate}>
        {children}
      </MedplumProvider>
    ));

    // Create the draft thread from the New Message dialog (patient pre-filled from subject,
    // practitioner defaulted from the signed-in profile).
    await user.type(await screen.findByPlaceholderText('Enter your topic'), 'Draft Topic');
    const nextButton = screen.getByRole('button', { name: 'Next' });
    await waitFor(() => expect(nextButton).toBeEnabled());
    await user.click(nextButton);
    await waitFor(() => expect(mockOnNew).toHaveBeenCalled());
    const created = mockOnNew.mock.calls[0][0] as Communication;

    // Select the draft thread, as navigating to it after creation would.
    rerender(ui(created.id, false));

    await waitFor(() => expect(screen.getAllByText('Draft Topic').length).toBeGreaterThan(0), { timeout: 3000 });
    expect(screen.queryByRole('button', { name: 'Message settings' })).not.toBeInTheDocument();

    // Once the list knows the thread has a message, the refetch triggered by sending
    // (onMessageSent -> refreshThreadMessages) makes the thread official and settings appear.
    const reply: Communication = {
      resourceType: 'Communication',
      id: 'reply-1',
      status: 'in-progress',
      partOf: [{ reference: `Communication/${created.id}` }],
      sent: '2024-01-01T10:00:00Z',
      payload: [{ contentString: 'First message' }],
    };
    vi.mocked(medplum.search).mockResolvedValue({
      resourceType: 'Bundle',
      type: 'searchset',
      total: 1,
      entry: [{ resource: created }],
    } as any);
    vi.mocked(medplum.graphql).mockResolvedValue({
      data: { [`thread_${created.id?.replaceAll('-', '')}`]: [reply] },
    });

    await user.type(screen.getByPlaceholderText('Type a message...'), 'First message');
    await user.click(screen.getByRole('button', { name: 'Send message' }));

    await waitFor(() => expect(screen.getByRole('button', { name: 'Message settings' })).toBeInTheDocument(), {
      timeout: 3000,
    });
  });

  test('shows patient summary when showPatientSummary is true and thread is selected', async () => {
    const medplumReact = await import('../../PatientSummary/PatientSummary');
    const patientSummarySpy = vi.spyOn(medplumReact, 'PatientSummary');

    await medplum.createResource(mockCommunication);

    medplum.search = vi.fn().mockResolvedValue({
      resourceType: 'Bundle',
      type: 'searchset',
      entry: [{ resource: mockCommunication }],
    });
    medplum.graphql = vi.fn().mockResolvedValue({ data: { CommunicationList: [] } });

    await setup({ showPatientSummary: true, threadId: 'comm-123' });

    await waitFor(
      () => {
        expect(patientSummarySpy).toHaveBeenCalled();
      },
      { timeout: 3000 }
    );
  });

  test('does not show patient summary when showPatientSummary is false', async () => {
    const medplumReact = await import('../../PatientSummary/PatientSummary');
    const patientSummarySpy = vi.spyOn(medplumReact, 'PatientSummary');

    await medplum.createResource(mockCommunication);

    medplum.search = vi.fn().mockResolvedValue({
      resourceType: 'Bundle',
      type: 'searchset',
      entry: [{ resource: mockCommunication }],
    });
    medplum.graphql = vi.fn().mockResolvedValue({ data: { CommunicationList: [] } });

    await setup({ showPatientSummary: false, threadId: 'comm-123' });

    await waitFor(
      () => {
        expect(patientSummarySpy).not.toHaveBeenCalled();
      },
      { timeout: 3000 }
    );
  });

  test('opens new topic dialog when plus button is clicked', async () => {
    const user = userEvent.setup();
    await setup();

    const iconButtons = screen.getAllByRole('button', { name: '' });
    const plusButton = iconButtons[iconButtons.length - 1];
    await user.click(plusButton);

    await waitFor(() => {
      expect(screen.getByText('New Message')).toBeInTheDocument();
    });
  });

  test('closes new topic dialog when close is clicked', async () => {
    const user = userEvent.setup();
    await setup();

    const iconButtons = screen.getAllByRole('button', { name: '' });
    const plusButton = iconButtons[iconButtons.length - 1];
    await user.click(plusButton);

    await waitFor(() => {
      expect(screen.getByText('New Message')).toBeInTheDocument();
    });

    const closeButton = document.querySelector('.mantine-Modal-close');
    if (closeButton) {
      await user.click(closeButton);
    }

    await waitFor(() => {
      expect(screen.queryByText('New Message')).not.toBeInTheDocument();
    });
  });

  test('shows new topic dialog when newTopicOpened is true', async () => {
    await setup({ newTopicOpened: true, onNewTopicOpen: vi.fn(), onNewTopicClose: vi.fn() });

    expect(screen.getByText('New Message')).toBeInTheDocument();
  });

  test('calls onNewTopicOpen instead of opening dialog when controlled', async () => {
    const user = userEvent.setup();
    const onNewTopicOpen = vi.fn();
    await setup({ newTopicOpened: false, onNewTopicOpen, onNewTopicClose: vi.fn() });

    const iconButtons = screen.getAllByRole('button', { name: '' });
    const plusButton = iconButtons[iconButtons.length - 1];
    await user.click(plusButton);

    expect(onNewTopicOpen).toHaveBeenCalled();
    expect(screen.queryByText('New Message')).not.toBeInTheDocument();
  });

  test('calls onNewTopicClose when controlled dialog is closed', async () => {
    const user = userEvent.setup();
    const onNewTopicClose = vi.fn();
    await setup({ newTopicOpened: true, onNewTopicOpen: vi.fn(), onNewTopicClose });

    expect(screen.getByText('New Message')).toBeInTheDocument();

    const closeButton = document.querySelector('.mantine-Modal-close');
    expect(closeButton).not.toBeNull();
    await user.click(closeButton as Element);

    expect(onNewTopicClose).toHaveBeenCalled();
  });

  test('displays "Messages" in header when thread has no topic', async () => {
    const commWithoutTopic: Communication = { ...mockCommunication, topic: undefined };
    await medplum.createResource(commWithoutTopic);

    medplum.search = vi.fn().mockResolvedValue({
      resourceType: 'Bundle',
      type: 'searchset',
      entry: [{ resource: commWithoutTopic }],
    });
    medplum.graphql = vi.fn().mockResolvedValue({ data: { CommunicationList: [] } });

    await setup({ threadId: 'comm-123' });

    await waitFor(
      () => {
        const messagesTexts = screen.getAllByText('Messages');
        expect(messagesTexts.length).toBeGreaterThan(0);
      },
      { timeout: 3000 }
    );
  });

  test('changes status filter to completed when Completed button is clicked', async () => {
    const user = userEvent.setup();
    await setup();

    const completedButton = screen.getByText('Completed');
    await user.click(completedButton);

    await waitFor(() => {
      expect(medplum.search).toHaveBeenCalled();
    });
  });

  test('shows status dropdown for in-progress thread', async () => {
    const user = userEvent.setup();
    await medplum.createResource(mockCommunication);

    medplum.search = vi.fn().mockResolvedValue({
      resourceType: 'Bundle',
      type: 'searchset',
      entry: [{ resource: mockCommunication }],
    });
    medplum.graphql = vi.fn().mockResolvedValue({ data: { CommunicationList: [] } });

    await setup({ threadId: 'comm-123' });

    await waitFor(
      () => {
        expect(screen.getAllByRole('button', { name: 'In Progress' }).length).toBeGreaterThan(0);
      },
      { timeout: 3000 }
    );

    const statusButtons = screen.getAllByRole('button', { name: 'In Progress' });
    const statusButton = statusButtons[statusButtons.length - 1];
    await user.click(statusButton);

    await waitFor(() => {
      expect(screen.getByRole('menu')).toBeInTheDocument();
    });
  });

  test('changes thread status to completed through dropdown', async () => {
    const user = userEvent.setup();
    await medplum.createResource(mockCommunication);

    medplum.search = vi.fn().mockResolvedValue({
      resourceType: 'Bundle',
      type: 'searchset',
      entry: [{ resource: mockCommunication }],
    });
    medplum.graphql = vi.fn().mockResolvedValue({ data: { CommunicationList: [] } });

    const updateResourceSpy = vi.spyOn(medplum, 'updateResource');

    await setup({ threadId: 'comm-123' });

    await waitFor(
      () => {
        expect(screen.getAllByRole('button', { name: 'In Progress' }).length).toBeGreaterThan(0);
      },
      { timeout: 3000 }
    );

    const statusButtons = screen.getAllByRole('button', { name: 'In Progress' });
    const statusButton = statusButtons[statusButtons.length - 1];
    await user.click(statusButton);

    await waitFor(() => {
      expect(screen.getByRole('menu')).toBeInTheDocument();
    });

    const completedMenuItem = screen.queryByText('Completed', { selector: '[role="menuitem"]' });
    if (completedMenuItem) {
      await user.click(completedMenuItem);
      await waitFor(() => {
        expect(updateResourceSpy).toHaveBeenCalled();
      });
    }
  });

  test('shows green status badge for completed thread', async () => {
    const completedCommunication: Communication = { ...mockCommunication, status: 'completed' };
    await medplum.createResource(completedCommunication);

    medplum.search = vi.fn().mockResolvedValue({
      resourceType: 'Bundle',
      type: 'searchset',
      entry: [{ resource: completedCommunication }],
    });
    medplum.graphql = vi.fn().mockResolvedValue({ data: { CommunicationList: [] } });

    await setup({ threadId: 'comm-123' });

    await waitFor(
      () => {
        const buttons = screen.getAllByRole('button');
        const completedButton = buttons.find((btn) => btn.textContent?.includes('Completed'));
        expect(completedButton).toBeInTheDocument();
      },
      { timeout: 3000 }
    );
  });

  test('shows red status badge for stopped thread', async () => {
    const stoppedCommunication: Communication = { ...mockCommunication, status: 'stopped' };
    await medplum.createResource(stoppedCommunication);

    medplum.search = vi.fn().mockResolvedValue({
      resourceType: 'Bundle',
      type: 'searchset',
      entry: [{ resource: stoppedCommunication }],
    });
    medplum.graphql = vi.fn().mockResolvedValue({ data: { CommunicationList: [] } });

    await setup({ threadId: 'comm-123' });

    await waitFor(
      () => {
        const buttons = screen.getAllByRole('button');
        const stoppedButton = buttons.find((btn) => btn.textContent?.includes('Stopped'));
        expect(stoppedButton).toBeInTheDocument();
      },
      { timeout: 3000 }
    );
  });

  test('shows error notification when status change fails', async () => {
    const user = userEvent.setup();
    await medplum.createResource(mockCommunication);

    medplum.search = vi.fn().mockResolvedValue({
      resourceType: 'Bundle',
      type: 'searchset',
      entry: [{ resource: mockCommunication }],
    });
    medplum.graphql = vi.fn().mockResolvedValue({ data: { CommunicationList: [] } });
    medplum.updateResource = vi.fn().mockRejectedValue(new Error('Status update failed'));

    await setup({ threadId: 'comm-123' });

    await waitFor(
      () => {
        expect(screen.getAllByRole('button', { name: 'In Progress' }).length).toBeGreaterThan(0);
      },
      { timeout: 3000 }
    );

    const statusButtons = screen.getAllByRole('button', { name: 'In Progress' });
    const statusButton = statusButtons[statusButtons.length - 1];
    await user.click(statusButton);

    await waitFor(() => {
      expect(screen.getByRole('menu')).toBeInTheDocument();
    });

    const completedMenuItem = screen.queryByText('Completed', { selector: '[role="menuitem"]' });
    if (completedMenuItem) {
      await user.click(completedMenuItem);
      await waitFor(() => {
        expect(screen.getByText(/Status update failed/i)).toBeInTheDocument();
      });
    }
  });

  test('shows pagination when total exceeds items per page', async () => {
    await medplum.createResource(mockCommunication);

    medplum.search = vi.fn().mockResolvedValue({
      resourceType: 'Bundle',
      type: 'searchset',
      total: 50,
      entry: [{ resource: mockCommunication }],
    });
    medplum.graphql = vi.fn().mockResolvedValue({ data: { CommunicationList: [] } });

    await setup();

    await waitFor(
      () => {
        const pagination = document.querySelector('.mantine-Pagination-root');
        expect(pagination).toBeInTheDocument();
      },
      { timeout: 3000 }
    );
  });
});
