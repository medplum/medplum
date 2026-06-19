// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { createReference } from '@medplum/core';
import type { Communication } from '@medplum/fhirtypes';
import { HomerSimpson, MockClient } from '@medplum/mock';
import { MedplumProvider } from '@medplum/react-hooks';
import { MemoryRouter } from 'react-router';
import { render, screen, waitFor } from '../../test-utils/render';
import { ThreadListItem } from './ThreadListItem';

const mockTopic: Communication = {
  resourceType: 'Communication',
  id: 'topic-123',
  status: 'in-progress',
  subject: createReference(HomerSimpson),
  topic: { text: 'Test Topic' },
};

const mockLastCommunication: Communication = {
  resourceType: 'Communication',
  id: 'last-comm-123',
  status: 'in-progress',
  sent: '2024-01-15T10:30:00Z',
  sender: { display: 'Dr. Smith' },
  payload: [
    {
      contentString:
        'This is a test message that is longer than 100 characters to test the truncation functionality of the chat list item component',
    },
  ],
};

const mockGetThreadUri = vi.fn((topic: Communication) => `/Message/${topic.id}`);

describe('ThreadListItem', () => {
  let medplum: MockClient;

  beforeEach(async () => {
    medplum = new MockClient();
    vi.clearAllMocks();
  });

  const setup = (topic: Communication, lastCommunication: Communication | undefined): void => {
    render(
      <ThreadListItem topic={topic} lastCommunication={lastCommunication} getThreadUri={mockGetThreadUri} />,
      ({ children }) => (
        <MemoryRouter>
          <MedplumProvider medplum={medplum}>{children}</MedplumProvider>
        </MemoryRouter>
      )
    );
  };

  test('renders topic with patient name', async () => {
    setup(mockTopic, mockLastCommunication);
    await waitFor(() => {
      expect(screen.getByText('Homer Simpson')).toBeInTheDocument();
    });
  });

  test('renders topic text when available', async () => {
    setup(mockTopic, mockLastCommunication);
    await waitFor(() => {
      expect(screen.getByText('Test Topic')).toBeInTheDocument();
    });
  });

  test('renders last message when topic text is not available', async () => {
    const topicWithoutText: Communication = { ...mockTopic, topic: undefined };
    setup(topicWithoutText, mockLastCommunication);
    await waitFor(() => {
      expect(screen.getByText(/Dr. Smith/)).toBeInTheDocument();
    });
  });

  test('truncates long messages when topic text is not available', async () => {
    const longMessage =
      'This is a very long message from Dr. Smith that is meant to exceed one hundred characters in length. It just keeps going and going beyond the limit of what is shown in the UI preview.';
    const topicWithoutText: Communication = { ...mockTopic, topic: undefined };
    const lastCommunicationWithLongMessage: Communication = {
      ...mockLastCommunication,
      payload: [{ contentString: longMessage }],
    };
    setup(topicWithoutText, lastCommunicationWithLongMessage);
    await waitFor(() => {
      const truncated = `Dr. Smith: ${longMessage.slice(0, 100)}...`;
      expect(screen.getByText(truncated)).toBeInTheDocument();
    });
  });

  test('shows topic text when available, even without last communication', async () => {
    setup(mockTopic, undefined);
    await waitFor(() => {
      expect(screen.getByText('Test Topic')).toBeInTheDocument();
    });
  });

  test('displays formatted date when last communication exists', async () => {
    setup(mockTopic, mockLastCommunication);
    await waitFor(() => {
      const dateElement = screen.getByText(/2024/);
      expect(dateElement).toBeInTheDocument();
    });
  });

  test('generates correct link from getThreadUri', async () => {
    setup(mockTopic, mockLastCommunication);
    await waitFor(() => {
      const link = screen.getByRole('link');
      expect(link).toHaveAttribute('href', '/Message/topic-123');
    });
  });

  test('handles message without sender display', async () => {
    const commWithoutSender: Communication = { ...mockLastCommunication, sender: undefined };
    setup(mockTopic, commWithoutSender);
    await waitFor(() => {
      expect(screen.getByText(/Test Topic/)).toBeInTheDocument();
    });
  });

  test('handles short messages without truncation', async () => {
    const shortMessage: Communication = {
      ...mockLastCommunication,
      payload: [{ contentString: 'Short message' }],
    };
    setup(mockTopic, shortMessage);
    await waitFor(() => {
      expect(screen.getByText('Test Topic')).toBeInTheDocument();
    });
  });
});
