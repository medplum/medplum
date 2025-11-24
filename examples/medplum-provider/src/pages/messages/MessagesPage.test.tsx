// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { MantineProvider } from '@mantine/core';
import { Notifications } from '@mantine/notifications';
import type { Communication } from '@medplum/fhirtypes';
import { MockClient } from '@medplum/mock';
import { MedplumProvider } from '@medplum/react';
import { act, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router';
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { MessagesPage } from './MessagesPage';

const mockNavigate = vi.fn();
const mockUseParams = vi.fn();

vi.mock('react-router', async () => {
  const actual = await vi.importActual('react-router');
  return {
    ...actual,
    useNavigate: () => mockNavigate,
    useParams: () => mockUseParams(),
  };
});

const mockHandleNewThread = vi.fn();
const mockOnSelectedItem = vi.fn();

vi.mock('../../components/messages/ThreadInbox', () => ({
  ThreadInbox: (props: {
    threadId?: string;
    query: string;
    showPatientSummary: boolean;
    handleNewThread: (message: Communication) => void;
    onSelectedItem: (topic: Communication) => string;
  }) => {
    mockHandleNewThread.mockImplementation(props.handleNewThread);
    mockOnSelectedItem.mockImplementation(props.onSelectedItem);

    return (
      <div data-testid="thread-inbox">
        <div data-testid="thread-id">{props.threadId || 'no-thread-id'}</div>
        <div data-testid="query">{props.query}</div>
        <div data-testid="show-patient-summary">{props.showPatientSummary ? 'true' : 'false'}</div>
        <button
          data-testid="test-handle-new-thread"
          onClick={() => {
            const mockMessage: Communication = {
              resourceType: 'Communication',
              id: 'test-message-123',
              status: 'in-progress',
            };
            props.handleNewThread(mockMessage);
          }}
        >
          Test New Thread
        </button>
      </div>
    );
  },
}));

describe('MessagesPage', () => {
  let medplum: MockClient;

  beforeEach(() => {
    medplum = new MockClient();
    vi.clearAllMocks();
    mockNavigate.mockResolvedValue(undefined);
  });

  const setup = (messageId?: string): void => {
    mockUseParams.mockReturnValue({ messageId });

    render(
      <MemoryRouter initialEntries={['/Message']}>
        <MedplumProvider medplum={medplum}>
          <MantineProvider>
            <Notifications />
            <MessagesPage />
          </MantineProvider>
        </MedplumProvider>
      </MemoryRouter>
    );
  };

  it('passes undefined threadId when messageId is not in URL', async () => {
    await act(async () => {
      setup();
    });

    await waitFor(() => {
      expect(screen.getByTestId('thread-inbox')).toBeInTheDocument();
    });

    expect(screen.getByTestId('thread-id')).toHaveTextContent('no-thread-id');
  });

  it('passes messageId as threadId when messageId is in URL', async () => {
    const messageId = 'message-123';
    await act(async () => {
      setup(messageId);
    });

    await waitFor(() => {
      expect(screen.getByTestId('thread-inbox')).toBeInTheDocument();
    });

    expect(screen.getByTestId('thread-id')).toHaveTextContent(messageId);
  });

  it('passes correct query to ThreadInbox', async () => {
    await act(async () => {
      setup();
    });

    await waitFor(() => {
      expect(screen.getByTestId('thread-inbox')).toBeInTheDocument();
    });

    expect(screen.getByTestId('query')).toHaveTextContent('_sort=-_lastUpdated');
  });

  it('passes showPatientSummary as true to ThreadInbox', async () => {
    await act(async () => {
      setup();
    });

    await waitFor(() => {
      expect(screen.getByTestId('thread-inbox')).toBeInTheDocument();
    });

    expect(screen.getByTestId('show-patient-summary')).toHaveTextContent('true');
  });

  it('handleNewThread navigates to correct URL', async () => {
    const user = userEvent.setup();
    await act(async () => {
      setup();
    });

    await waitFor(() => {
      expect(screen.getByTestId('thread-inbox')).toBeInTheDocument();
    });

    const testButton = screen.getByTestId('test-handle-new-thread');
    await user.click(testButton);

    await waitFor(() => {
      expect(mockNavigate).toHaveBeenCalledWith('/Message/test-message-123');
    });
  });

  it('onSelectedItem returns correct path', async () => {
    await act(async () => {
      setup();
    });

    await waitFor(() => {
      expect(screen.getByTestId('thread-inbox')).toBeInTheDocument();
    });

    const mockTopic: Communication = {
      resourceType: 'Communication',
      id: 'test-topic-456',
      status: 'in-progress',
    };

    const result = mockOnSelectedItem(mockTopic);
    expect(result).toBe('/Message/test-topic-456');
  });

  it('handleNewThread handles navigation errors gracefully', async () => {
    const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    mockNavigate.mockRejectedValue(new Error('Navigation failed'));

    const user = userEvent.setup();
    await act(async () => {
      setup();
    });

    await waitFor(() => {
      expect(screen.getByTestId('thread-inbox')).toBeInTheDocument();
    });

    const testButton = screen.getByTestId('test-handle-new-thread');
    await user.click(testButton);

    await waitFor(() => {
      expect(mockNavigate).toHaveBeenCalled();
    });

    await waitFor(() => {
      expect(consoleErrorSpy).toHaveBeenCalled();
    });

    consoleErrorSpy.mockRestore();
  });

  it('renders with different messageId values', async () => {
    const messageId = 'different-message-789';
    await act(async () => {
      setup(messageId);
    });

    await waitFor(() => {
      expect(screen.getByTestId('thread-inbox')).toBeInTheDocument();
    });

    expect(screen.getByTestId('thread-id')).toHaveTextContent(messageId);
  });
});
