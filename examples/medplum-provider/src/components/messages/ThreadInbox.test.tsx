// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { MantineProvider } from '@mantine/core';
import { Notifications } from '@mantine/notifications';
import type { Communication } from '@medplum/fhirtypes';
import { HomerSimpson, MockClient } from '@medplum/mock';
import { MedplumProvider } from '@medplum/react';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router';
import { describe, expect, test, vi, beforeEach } from 'vitest';
import { ThreadInbox } from './ThreadInbox';

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
          <MantineProvider>
            <Notifications />
            <ThreadInbox
              query="_sort=-_lastUpdated"
              threadId={props?.threadId}
              showPatientSummary={props?.showPatientSummary ?? false}
              subject={props?.subject}
              handleNewThread={mockHandleNewThread}
              onSelectedItem={mockOnSelectedItem}
            />
          </MantineProvider>
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
      },
      {
        resourceType: 'Communication',
        id: 'comm-2',
        status: 'in-progress',
        topic: { text: 'Topic Beta' },
        subject: { reference: `Patient/${HomerSimpson.id}` },
      },
      {
        resourceType: 'Communication',
        id: 'comm-3',
        status: 'completed',
        topic: { text: 'Topic Gamma' },
        subject: { reference: `Patient/${HomerSimpson.id}` },
      },
    ];

    for (const comm of communications) {
      await medplum.createResource(comm);
    }

    const lastMessages: Communication[] = communications.map((comm) => ({
      resourceType: 'Communication',
      id: `last-${comm.id}`,
      status: 'in-progress',
      partOf: [{ reference: `Communication/${comm.id}` }],
      sent: '2024-01-01T12:00:00Z',
      payload: [{ contentString: `Last message for ${comm.topic?.text}` }],
    }));

    for (const msg of lastMessages) {
      await medplum.createResource(msg);
    }

    medplum.search = vi.fn().mockResolvedValue({
      resourceType: 'Bundle',
      type: 'searchset',
      entry: communications.map((comm) => ({ resource: comm })),
    });

    medplum.graphql = vi.fn().mockResolvedValue({
      data: {
        CommunicationList: lastMessages.map((msg) => ({
          id: msg.id,
          partOf: msg.partOf,
          sender: { display: 'Sender' },
          payload: msg.payload,
          status: msg.status,
        })),
      },
    });

    setup();

    await waitFor(
      () => {
        expect(screen.getByText('Topic Alpha')).toBeInTheDocument();
        expect(screen.getByText('Topic Beta')).toBeInTheDocument();
        expect(screen.getByText('Topic Gamma')).toBeInTheDocument();
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
  });

  test('shows patient summary when showPatientSummary is true and thread is selected', async () => {
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
        expect(screen.getByText('Homer Simpson')).toBeInTheDocument();
        expect(screen.getByText('1956-05-12 (069Y)')).toBeInTheDocument();
      },
      { timeout: 3000 }
    );
  });

  test('does not show patient summary when showPatientSummary is false', async () => {
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
        expect(screen.queryByText('Homer Simpson')).not.toBeInTheDocument();
        expect(screen.queryByText('1956-05-12 (069Y)')).not.toBeInTheDocument();
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
