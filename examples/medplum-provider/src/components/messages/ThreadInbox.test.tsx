// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { Notifications } from '@mantine/notifications';
import type { Communication } from '@medplum/fhirtypes';
import { HomerSimpson, MockClient } from '@medplum/mock';
import { MedplumProvider } from '@medplum/react';
import { render, screen, waitFor, userEvent } from '../../test-utils/render';
import { MemoryRouter } from 'react-router';
import { describe, expect, test, vi, beforeEach } from 'vitest';
import type { WithId } from '@medplum/core';
import { ThreadInbox } from './ThreadInbox';
import * as reactHooks from '@medplum/react-hooks';

vi.mock('@medplum/react-hooks', async () => {
  const actual = await vi.importActual('@medplum/react-hooks');
  return {
    ...actual,
    useSubscription: vi.fn(),
  };
});

const mockCommunication: Communication | undefined = {
  resourceType: 'Communication',
  id: 'comm-123',
  status: 'in-progress',
  topic: { text: 'Test Topic' },
  subject: { reference: `Patient/${HomerSimpson.id}` },
};

const mockHandleNewThread = vi.fn();
const mockOnSelectedItem = vi.fn((topic: Communication) => `/Message/${topic.id}`);

describe('ThreadInbox', () => {
  let medplum: MockClient;

  beforeEach(async () => {
    medplum = new MockClient();
    vi.clearAllMocks();
    vi.mocked(reactHooks.useSubscription).mockClear();
    await medplum.createResource(HomerSimpson);

    // Mock search and graphql to return empty results by default
    medplum.search = vi.fn().mockResolvedValue({
      resourceType: 'Bundle',
      type: 'searchset',
      entry: [],
    });
    medplum.graphql = vi.fn().mockResolvedValue({
      data: { CommunicationList: [] },
    });
  });

  const setup = (props?: { threadId?: string; showPatientSummary?: boolean; subject?: typeof HomerSimpson }): void => {
    render(
      <MemoryRouter>
        <MedplumProvider medplum={medplum}>
          <Notifications />
          <ThreadInbox
            query="_sort=-_lastUpdated"
            threadId={props?.threadId}
            showPatientSummary={props?.showPatientSummary ?? false}
            subject={props?.subject}
            handleNewThread={mockHandleNewThread}
            onSelectedItem={mockOnSelectedItem}
          />
        </MedplumProvider>
      </MemoryRouter>
    );
  };

  test('renders messages header', () => {
    setup();
    expect(screen.getByText('Messages')).toBeInTheDocument();
  });

  test('renders status filter buttons', () => {
    setup();
    expect(screen.getByText('In progress')).toBeInTheDocument();
    expect(screen.getByText('Completed')).toBeInTheDocument();
  });

  test('shows loading skeletons when loading', async () => {
    medplum.search = vi.fn().mockImplementation(() => new Promise(() => {}));
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
        meta: {
          lastUpdated: '2024-01-01T10:00:00Z',
        },
      },
      {
        resourceType: 'Communication',
        id: 'comm-2',
        status: 'in-progress',
        topic: { text: 'Topic Beta' },
        subject: { reference: `Patient/${HomerSimpson.id}` },
        meta: {
          lastUpdated: '2024-01-01T11:00:00Z',
        },
      },
      {
        resourceType: 'Communication',
        id: 'comm-3',
        status: 'completed',
        topic: { text: 'Topic Gamma' },
        subject: { reference: `Patient/${HomerSimpson.id}` },
        meta: {
          lastUpdated: '2024-01-01T12:00:00Z',
        },
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
      sent: `2024-01-01T${12 + index}:00:00Z`, // Different sent times for sorting
      payload: [{ contentString: `Last message for ${comm.topic?.text}` }],
      meta: {
        lastUpdated: `2024-01-01T${12 + index}:00:00Z`,
      },
      sender: {
        display: 'Test Sender',
        reference: 'Practitioner/test',
      },
    }));

    for (const msg of lastMessages) {
      await medplum.createResource(msg);
    }

    vi.spyOn(medplum, 'searchResources').mockResolvedValue([
      communications[0] as WithId<Communication>,
      communications[1] as WithId<Communication>,
      // comm-3 excluded because it has status 'completed'
    ] as any);

    vi.spyOn(medplum, 'graphql').mockImplementation((_query: string) => {
      // Return data matching the alias format
      return Promise.resolve({
        data: {
          thread_comm1: [lastMessages[0]],
          thread_comm2: [lastMessages[1]],
          // thread_comm3 not included because comm-3 has status 'completed' and will be filtered out by the status=in-progress query
        },
      });
    });

    setup();

    await waitFor(
      () => {
        expect(screen.getByText('Topic Alpha')).toBeInTheDocument();
        expect(screen.getByText('Topic Beta')).toBeInTheDocument();
        // Topic Gamma won't appear because comm-3 has status 'completed'
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

    medplum.search = vi.fn().mockResolvedValue({
      resourceType: 'Bundle',
      type: 'searchset',
      entry: [{ resource: mockCommunication }],
    });
    medplum.graphql = vi.fn().mockResolvedValue({
      data: { CommunicationList: [] },
    });

    setup({ threadId: 'comm-123' });

    await waitFor(
      () => {
        const topicTexts = screen.getAllByText('Test Topic');
        expect(topicTexts.length).toBeGreaterThan(0);
      },
      { timeout: 3000 }
    );

    // Verify useSubscription was called (ThreadChat uses BaseChat which uses useSubscription)
    expect(vi.mocked(reactHooks.useSubscription)).toHaveBeenCalled();
  });

  test('shows patient summary when showPatientSummary is true and thread is selected', async () => {
    const medplumReact = await import('@medplum/react');
    const patientSummarySpy = vi.spyOn(medplumReact, 'PatientSummary');

    await medplum.createResource(mockCommunication);

    medplum.search = vi.fn().mockResolvedValue({
      resourceType: 'Bundle',
      type: 'searchset',
      entry: [{ resource: mockCommunication }],
    });
    medplum.graphql = vi.fn().mockResolvedValue({
      data: { CommunicationList: [] },
    });

    setup({ showPatientSummary: true, threadId: 'comm-123' });

    await waitFor(
      () => {
        expect(patientSummarySpy).toHaveBeenCalled();
      },
      { timeout: 3000 }
    );
  });

  test('does not show patient summary when showPatientSummary is false', async () => {
    const medplumReact = await import('@medplum/react');
    const patientSummarySpy = vi.spyOn(medplumReact, 'PatientSummary');
    await medplum.createResource(mockCommunication);

    medplum.search = vi.fn().mockResolvedValue({
      resourceType: 'Bundle',
      type: 'searchset',
      entry: [{ resource: mockCommunication }],
    });
    medplum.graphql = vi.fn().mockResolvedValue({
      data: { CommunicationList: [] },
    });

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

    const plusButton = screen.getByRole('button', { name: '' }); // Icon button
    await user.click(plusButton);

    await waitFor(() => {
      expect(screen.getByText('New Message')).toBeInTheDocument();
    });
  });

  test('closes new topic dialog when close is clicked', async () => {
    const user = userEvent.setup();
    setup();

    // Open dialog first
    const plusButton = screen.getByRole('button', { name: '' });
    await user.click(plusButton);

    await waitFor(() => {
      expect(screen.getByText('New Message')).toBeInTheDocument();
    });

    // Close dialog
    const closeButton = document.querySelector('.mantine-Modal-close');
    if (closeButton) {
      await user.click(closeButton);
    }

    await waitFor(() => {
      expect(screen.queryByText('New Message')).not.toBeInTheDocument();
    });
  });

  test('displays "Messages" in header when thread has no topic', async () => {
    const commWithoutTopic: Communication = {
      ...mockCommunication,
      topic: undefined,
    };
    await medplum.createResource(commWithoutTopic);

    medplum.search = vi.fn().mockResolvedValue({
      resourceType: 'Bundle',
      type: 'searchset',
      entry: [{ resource: commWithoutTopic }],
    });
    medplum.graphql = vi.fn().mockResolvedValue({
      data: { CommunicationList: [] },
    });

    setup({ threadId: 'comm-123' });

    await waitFor(
      () => {
        const messagesTexts = screen.getAllByText('Messages');
        expect(messagesTexts.length).toBeGreaterThan(0);
      },
      { timeout: 3000 }
    );
  });
});
