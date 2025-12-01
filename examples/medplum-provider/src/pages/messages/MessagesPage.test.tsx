// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { MantineProvider } from '@mantine/core';
import { Notifications } from '@mantine/notifications';
import type { Communication } from '@medplum/fhirtypes';
import { HomerSimpson, MockClient } from '@medplum/mock';
import { MedplumProvider } from '@medplum/react';
import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { describe, expect, test, vi, beforeEach } from 'vitest';
import { MessagesPage } from './MessagesPage';

describe('MessagesPage', () => {
  let medplum: MockClient;

  beforeEach(async () => {
    medplum = new MockClient();
    vi.clearAllMocks();
    await medplum.createResource(HomerSimpson);
  });

  const setup = (messageId?: string): void => {
    const path = messageId ? `/Message/${messageId}` : '/Message';
    render(
      <MemoryRouter initialEntries={[path]}>
        <MedplumProvider medplum={medplum}>
          <MantineProvider>
            <Notifications />
            <MessagesPage />
          </MantineProvider>
        </MedplumProvider>
      </MemoryRouter>
    );
  };

  test('shows empty state when messageId is not in URL', async () => {
    setup();

    await waitFor(() => {
      expect(screen.getByText('Messages')).toBeInTheDocument();
    });

    expect(screen.getByText('Select a message from the list to view details')).toBeInTheDocument();
  });

  test('attempts to load thread when messageId is in URL', async () => {
    const mockCommunication: Communication = {
      resourceType: 'Communication',
      id: 'comm-123',
      status: 'in-progress',
      topic: { text: 'Test Topic' },
      subject: { reference: `Patient/${HomerSimpson.id}` },
    };

    await medplum.createResource(mockCommunication);

    // Create a last message for the thread
    const lastMessage: Communication = {
      resourceType: 'Communication',
      id: 'last-msg-123',
      status: 'in-progress',
      partOf: [{ reference: `Communication/${mockCommunication.id}` }],
      sent: '2024-01-01T12:00:00Z',
      payload: [{ contentString: 'Last message' }],
    };
    await medplum.createResource(lastMessage);

    // Mock search to return the communication
    medplum.search = vi.fn().mockResolvedValue({
      resourceType: 'Bundle',
      type: 'searchset',
      entry: [{ resource: mockCommunication }],
    });

    // Mock graphql to return the last message
    medplum.graphql = vi.fn().mockResolvedValue({
      data: {
        CommunicationList: [
          {
            id: lastMessage.id,
            partOf: lastMessage.partOf,
            sender: { display: 'Sender' },
            payload: lastMessage.payload,
            status: lastMessage.status,
          },
        ],
      },
    });

    setup('comm-123');

    await waitFor(
      () => {
        expect(screen.getByText('Messages')).toBeInTheDocument();
      },
      { timeout: 3000 }
    );

    await waitFor(
      () => {
        expect(screen.getByText('Test Topic')).toBeInTheDocument();
      },
      { timeout: 3000 }
    );
  });
});
