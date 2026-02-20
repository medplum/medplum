// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { Notifications } from '@mantine/notifications';
import type { Communication } from '@medplum/fhirtypes';
import { HomerSimpson, MockClient } from '@medplum/mock';
import * as reactHooks from '@medplum/react-hooks';
import { MedplumProvider } from '@medplum/react-hooks';
import { MemoryRouter } from 'react-router';
import { render, screen, userEvent, waitFor } from '../../test-utils/render';
import { ThreadInbox } from './ThreadInbox';

jest.mock('@medplum/react-hooks', () => ({
  ...jest.requireActual('@medplum/react-hooks'),
  useSubscription: jest.fn(),
}));

const mockCommunication: Communication | undefined = {
  resourceType: 'Communication',
  id: 'comm-123',
  status: 'in-progress',
  topic: { text: 'Test Topic' },
  subject: { reference: `Patient/${HomerSimpson.id}` },
};

const mockOnNew = jest.fn();
const mockGetThreadUri = jest.fn((topic: Communication) => `/Message/${topic.id}`);
const mockOnChange = jest.fn();

describe('ThreadInbox', () => {
  let medplum: MockClient;

  beforeEach(async () => {
    medplum = new MockClient();
    jest.clearAllMocks();
    jest.mocked(reactHooks.useSubscription).mockClear();

    medplum.search = jest.fn().mockResolvedValue({
      resourceType: 'Bundle',
      type: 'searchset',
      total: 0,
      entry: [],
    });
    medplum.graphql = jest.fn().mockResolvedValue({
      data: { CommunicationList: [] },
    });
  });

  const setup = (props?: { threadId?: string; showPatientSummary?: boolean; subject?: typeof HomerSimpson }): void => {
    render(
      <>
        <Notifications />
        <ThreadInbox
          query="_sort=-_lastUpdated"
          threadId={props?.threadId}
          showPatientSummary={props?.showPatientSummary ?? false}
          subject={props?.subject}
          onNew={mockOnNew}
          getThreadUri={mockGetThreadUri}
          onChange={mockOnChange}
          inProgressUri="/Communication?status=in-progress"
          completedUri="/Communication?status=completed"
        />
      </>,
      ({ children }) => (
        <MemoryRouter>
          <MedplumProvider medplum={medplum}>{children}</MedplumProvider>
        </MemoryRouter>
      )
    );
  };

  test('renders filter buttons and new message button', async () => {
    setup();
    expect(screen.getByText('In progress')).toBeInTheDocument();
    expect(screen.getByText('Completed')).toBeInTheDocument();
    const iconButtons = screen.getAllByRole('button', { name: '' });
    expect(iconButtons.length).toBeGreaterThanOrEqual(2);
  });

  test('renders status filter buttons', async () => {
    setup();
    expect(screen.getByText('In progress')).toBeInTheDocument();
    expect(screen.getByText('Completed')).toBeInTheDocument();
  });

  test('shows loading skeletons when loading', async () => {
    medplum.search = jest.fn().mockImplementation(() => new Promise(() => {}));
    setup();

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

    jest.spyOn(medplum, 'search').mockResolvedValue({
      resourceType: 'Bundle',
      type: 'searchset',
      total: 2,
      entry: [{ resource: communications[0] }, { resource: communications[1] }],
    } as any);

    jest.spyOn(medplum, 'graphql').mockImplementation(() =>
      Promise.resolve({
        data: {
          thread_comm1: [lastMessages[0]],
          thread_comm2: [lastMessages[1]],
        },
      })
    );

    setup();

    await waitFor(
      () => {
        expect(screen.getByText('Topic Alpha')).toBeInTheDocument();
        expect(screen.getByText('Topic Beta')).toBeInTheDocument();
      },
      { timeout: 3000 }
    );
  });

  test('shows no messages state when no thread is selected', async () => {
    setup();
    await waitFor(() => {
      expect(screen.getByText('Select a message from the list to view details')).toBeInTheDocument();
    });
  });

  test('shows empty messages state when no messages are found', async () => {
    setup();
    await waitFor(
      () => {
        expect(screen.getByText('No messages found')).toBeInTheDocument();
      },
      { timeout: 3000 }
    );
  });

  test('shows thread chat when thread is selected', async () => {
    await medplum.createResource(mockCommunication);

    medplum.search = jest.fn().mockResolvedValue({
      resourceType: 'Bundle',
      type: 'searchset',
      entry: [{ resource: mockCommunication }],
    });
    medplum.graphql = jest.fn().mockResolvedValue({ data: { CommunicationList: [] } });

    setup({ threadId: 'comm-123' });

    await waitFor(
      () => {
        const topicTexts = screen.getAllByText('Test Topic');
        expect(topicTexts.length).toBeGreaterThan(0);
      },
      { timeout: 3000 }
    );

    expect(jest.mocked(reactHooks.useSubscription)).toHaveBeenCalled();
  });

  test('shows patient summary when showPatientSummary is true and thread is selected', async () => {
    const medplumReact = await import('../../PatientSummary/PatientSummary');
    const patientSummarySpy = jest.spyOn(medplumReact, 'PatientSummary');

    await medplum.createResource(mockCommunication);

    medplum.search = jest.fn().mockResolvedValue({
      resourceType: 'Bundle',
      type: 'searchset',
      entry: [{ resource: mockCommunication }],
    });
    medplum.graphql = jest.fn().mockResolvedValue({ data: { CommunicationList: [] } });

    setup({ showPatientSummary: true, threadId: 'comm-123' });

    await waitFor(
      () => {
        expect(patientSummarySpy).toHaveBeenCalled();
      },
      { timeout: 3000 }
    );
  });

  test('does not show patient summary when showPatientSummary is false', async () => {
    const medplumReact = await import('../../PatientSummary/PatientSummary');
    const patientSummarySpy = jest.spyOn(medplumReact, 'PatientSummary');

    await medplum.createResource(mockCommunication);

    medplum.search = jest.fn().mockResolvedValue({
      resourceType: 'Bundle',
      type: 'searchset',
      entry: [{ resource: mockCommunication }],
    });
    medplum.graphql = jest.fn().mockResolvedValue({ data: { CommunicationList: [] } });

    setup({ showPatientSummary: false, threadId: 'comm-123' });

    await waitFor(
      () => {
        expect(patientSummarySpy).not.toHaveBeenCalled();
      },
      { timeout: 3000 }
    );
  });

  test('opens new topic dialog when plus button is clicked', async () => {
    const user = userEvent.setup();
    setup();

    const iconButtons = screen.getAllByRole('button', { name: '' });
    const plusButton = iconButtons[iconButtons.length - 1];
    await user.click(plusButton);

    await waitFor(() => {
      expect(screen.getByText('New Message')).toBeInTheDocument();
    });
  });

  test('closes new topic dialog when close is clicked', async () => {
    const user = userEvent.setup();
    setup();

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

  test('displays "Messages" in header when thread has no topic', async () => {
    const commWithoutTopic: Communication = { ...mockCommunication, topic: undefined };
    await medplum.createResource(commWithoutTopic);

    medplum.search = jest.fn().mockResolvedValue({
      resourceType: 'Bundle',
      type: 'searchset',
      entry: [{ resource: commWithoutTopic }],
    });
    medplum.graphql = jest.fn().mockResolvedValue({ data: { CommunicationList: [] } });

    setup({ threadId: 'comm-123' });

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
    setup();

    const completedButton = screen.getByText('Completed');
    await user.click(completedButton);

    await waitFor(() => {
      expect(medplum.search).toHaveBeenCalled();
    });
  });

  test('shows status dropdown for in-progress thread', async () => {
    const user = userEvent.setup();
    await medplum.createResource(mockCommunication);

    medplum.search = jest.fn().mockResolvedValue({
      resourceType: 'Bundle',
      type: 'searchset',
      entry: [{ resource: mockCommunication }],
    });
    medplum.graphql = jest.fn().mockResolvedValue({ data: { CommunicationList: [] } });

    setup({ threadId: 'comm-123' });

    await waitFor(
      () => {
        expect(screen.getByText('In Progress')).toBeInTheDocument();
      },
      { timeout: 3000 }
    );

    await user.click(screen.getByText('In Progress'));

    await waitFor(() => {
      expect(screen.getByRole('menu')).toBeInTheDocument();
    });
  });

  test('changes thread status to completed through dropdown', async () => {
    const user = userEvent.setup();
    await medplum.createResource(mockCommunication);

    medplum.search = jest.fn().mockResolvedValue({
      resourceType: 'Bundle',
      type: 'searchset',
      entry: [{ resource: mockCommunication }],
    });
    medplum.graphql = jest.fn().mockResolvedValue({ data: { CommunicationList: [] } });

    const updateResourceSpy = jest.spyOn(medplum, 'updateResource');

    setup({ threadId: 'comm-123' });

    await waitFor(
      () => {
        expect(screen.getByText('In Progress')).toBeInTheDocument();
      },
      { timeout: 3000 }
    );

    await user.click(screen.getByText('In Progress'));

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

    medplum.search = jest.fn().mockResolvedValue({
      resourceType: 'Bundle',
      type: 'searchset',
      entry: [{ resource: completedCommunication }],
    });
    medplum.graphql = jest.fn().mockResolvedValue({ data: { CommunicationList: [] } });

    setup({ threadId: 'comm-123' });

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

    medplum.search = jest.fn().mockResolvedValue({
      resourceType: 'Bundle',
      type: 'searchset',
      entry: [{ resource: stoppedCommunication }],
    });
    medplum.graphql = jest.fn().mockResolvedValue({ data: { CommunicationList: [] } });

    setup({ threadId: 'comm-123' });

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

    medplum.search = jest.fn().mockResolvedValue({
      resourceType: 'Bundle',
      type: 'searchset',
      entry: [{ resource: mockCommunication }],
    });
    medplum.graphql = jest.fn().mockResolvedValue({ data: { CommunicationList: [] } });
    medplum.updateResource = jest.fn().mockRejectedValue(new Error('Status update failed'));

    setup({ threadId: 'comm-123' });

    await waitFor(
      () => {
        expect(screen.getByText('In Progress')).toBeInTheDocument();
      },
      { timeout: 3000 }
    );

    await user.click(screen.getByText('In Progress'));

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

    medplum.search = jest.fn().mockResolvedValue({
      resourceType: 'Bundle',
      type: 'searchset',
      total: 50,
      entry: [{ resource: mockCommunication }],
    });
    medplum.graphql = jest.fn().mockResolvedValue({ data: { CommunicationList: [] } });

    setup();

    await waitFor(
      () => {
        const pagination = document.querySelector('.mantine-Pagination-root');
        expect(pagination).toBeInTheDocument();
      },
      { timeout: 3000 }
    );
  });
});
