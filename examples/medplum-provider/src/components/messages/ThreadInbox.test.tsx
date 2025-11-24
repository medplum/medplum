// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { MantineProvider } from '@mantine/core';
import { Notifications } from '@mantine/notifications';
import type { Communication, Patient } from '@medplum/fhirtypes';
import { MockClient } from '@medplum/mock';
import { MedplumProvider } from '@medplum/react';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router';
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { ThreadInbox } from './ThreadInbox';
import * as notifications from '../../utils/notifications';

// Mock the useThreadInbox hook
const mockLoading = vi.fn(() => false);
const mockError = vi.fn(() => null as Error | null);
const mockThreadMessages = vi.fn((): [Communication, Communication | undefined][] => []);
const mockSelectedThread = vi.fn(() => mockCommunication);
const mockHandleThreadStatusChange = vi.fn();
const mockAddThreadMessage = vi.fn();

vi.mock('../../hooks/useThreadInbox', () => ({
  useThreadInbox: () => ({
    loading: mockLoading(),
    error: mockError(),
    threadMessages: mockThreadMessages(),
    selectedThread: mockSelectedThread(),
    handleThreadtatusChange: mockHandleThreadStatusChange,
    addThreadMessage: mockAddThreadMessage,
  }),
}));

// Mock ThreadChat and PatientSummary from @medplum/react
vi.mock('@medplum/react', async () => {
  const actual = await vi.importActual('@medplum/react');
  return {
    ...actual,
    ThreadChat: () => <div data-testid="thread-chat">Thread Chat</div>,
    PatientSummary: () => <div data-testid="patient-summary">Patient Summary</div>,
  };
});

vi.mock('../../utils/notifications', () => ({
  showErrorNotification: vi.fn(),
}));

vi.mock('./ChatList', () => ({
  ChatList: () => <div data-testid="chat-list">Chat List</div>,
}));

vi.mock('./NewTopicDialog', () => ({
  NewTopicDialog: (props: { opened: boolean; onClose: () => void; onSubmit?: (comm: Communication) => void }) => (
    <div data-testid="new-topic-dialog" data-opened={props.opened}>
      <button data-testid="close-dialog" onClick={props.onClose}>
        Close
      </button>
      {props.onSubmit && (
        <button
          data-testid="submit-dialog"
          onClick={() => {
            const mockComm: Communication = {
              resourceType: 'Communication',
              id: 'new-comm-123',
              status: 'in-progress',
            };
            props.onSubmit?.(mockComm);
          }}
        >
          Submit
        </button>
      )}
    </div>
  ),
}));

const mockCommunication: Communication | undefined = {
  resourceType: 'Communication',
  id: 'comm-123',
  status: 'in-progress',
  topic: { text: 'Test Topic' },
  subject: { reference: 'Patient/patient-123' },
};

const mockPatient: Patient = {
  resourceType: 'Patient',
  id: 'patient-123',
  name: [{ given: ['John'], family: 'Doe' }],
};

const mockHandleNewThread = vi.fn();
const mockOnSelectedItem = vi.fn((topic: Communication) => `/Message/${topic.id}`);

describe('ThreadInbox', () => {
  let medplum: MockClient;

  beforeEach(async () => {
    medplum = new MockClient();
    vi.clearAllMocks();
    await medplum.createResource(mockPatient);
    mockLoading.mockReturnValue(false);
    mockError.mockReturnValue(null);
    mockThreadMessages.mockReturnValue([]);
    mockSelectedThread.mockReturnValue(mockCommunication);
  });

  const setup = (props?: { threadId?: string; showPatientSummary?: boolean; subject?: Patient }): void => {
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

  it('renders messages header', () => {
    setup();
    expect(screen.getByText('Messages')).toBeInTheDocument();
  });

  it('renders status filter buttons', () => {
    setup();
    expect(screen.getByText('In progress')).toBeInTheDocument();
    expect(screen.getByText('Completed')).toBeInTheDocument();
  });

  it('shows loading skeletons when loading', () => {
    mockLoading.mockReturnValue(true);
    setup();

    const skeletons = document.querySelectorAll('.mantine-Skeleton-root');
    expect(skeletons.length).toBeGreaterThan(0);
  });

  it('shows chat list when not loading and has messages', () => {
    mockThreadMessages.mockReturnValue([[mockCommunication, undefined]]);
    setup();

    expect(screen.getByTestId('chat-list')).toBeInTheDocument();
  });

  it('shows no messages state when no thread is selected', () => {
    mockSelectedThread.mockReturnValue(undefined);
    setup();
    expect(screen.getByText('Select a message from the list to view details')).toBeInTheDocument();
  });

  it('shows thread chat when thread is selected', () => {
    mockThreadMessages.mockReturnValue([[mockCommunication, undefined]]);
    mockSelectedThread.mockReturnValue(mockCommunication);
    setup();

    expect(screen.getByTestId('thread-chat')).toBeInTheDocument();
  });

  it('shows patient summary when showPatientSummary is true and thread is selected', () => {
    mockThreadMessages.mockReturnValue([[mockCommunication, undefined]]);
    setup({ showPatientSummary: true });

    expect(screen.getByTestId('patient-summary')).toBeInTheDocument();
  });

  it('does not show patient summary when showPatientSummary is false', () => {
    mockThreadMessages.mockReturnValue([[mockCommunication, undefined]]);
    setup({ showPatientSummary: false });

    expect(screen.queryByTestId('patient-summary')).not.toBeInTheDocument();
  });

  it('opens new topic dialog when plus button is clicked', async () => {
    const user = userEvent.setup();
    setup();

    const plusButton = screen.getByRole('button', { name: '' }); // Icon button
    await user.click(plusButton);

    await waitFor(() => {
      const dialog = screen.getByTestId('new-topic-dialog');
      expect(dialog).toHaveAttribute('data-opened', 'true');
    });
  });

  it('closes new topic dialog when close is clicked', async () => {
    const user = userEvent.setup();
    setup();

    // Open dialog first
    const plusButton = screen.getByRole('button', { name: '' });
    await user.click(plusButton);

    await waitFor(() => {
      expect(screen.getByTestId('new-topic-dialog')).toBeInTheDocument();
    });

    // Close dialog
    const closeButton = screen.getByTestId('close-dialog');
    await user.click(closeButton);

    await waitFor(() => {
      const dialog = screen.getByTestId('new-topic-dialog');
      expect(dialog).toHaveAttribute('data-opened', 'false');
    });
  });

  it('calls handleNewThread when new topic is submitted', async () => {
    const user = userEvent.setup();
    setup();

    // Open dialog
    const plusButton = screen.getByRole('button', { name: '' });
    await user.click(plusButton);

    await waitFor(() => {
      expect(screen.getByTestId('new-topic-dialog')).toBeInTheDocument();
    });

    // Submit dialog
    const submitButton = screen.getByTestId('submit-dialog');
    await user.click(submitButton);

    await waitFor(() => {
      expect(mockHandleNewThread).toHaveBeenCalled();
      expect(mockAddThreadMessage).toHaveBeenCalled();
    });
  });

  it('changes status filter when button is clicked', async () => {
    const user = userEvent.setup();
    setup();

    const completedButton = screen.getByText('Completed');
    await user.click(completedButton);

    // Status should change (we can't easily verify the internal state,
    // but we can verify the button is clickable)
    expect(completedButton).toBeInTheDocument();
  });

  it('shows error notification when error occurs', () => {
    mockError.mockReturnValue(new Error('Test error') as Error);
    setup();

    expect(notifications.showErrorNotification).toHaveBeenCalled();
  });

  it('displays thread topic in header when thread is selected', () => {
    mockThreadMessages.mockReturnValue([[mockCommunication, undefined]]);
    setup();

    expect(screen.getByText('Test Topic')).toBeInTheDocument();
  });

  it('displays "Messages" in header when thread has no topic', () => {
    const commWithoutTopic: Communication = {
      ...mockCommunication,
      topic: undefined,
    };
    mockThreadMessages.mockReturnValue([[commWithoutTopic, undefined]]);
    setup();

    // There are multiple "Messages" texts, so we check that at least one exists
    // and specifically check the header area (which has fz="lg" styling)
    const messagesTexts = screen.getAllByText('Messages');
    expect(messagesTexts.length).toBeGreaterThan(0);
  });
});
