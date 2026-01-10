// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { MantineProvider } from '@mantine/core';
import { Notifications } from '@mantine/notifications';
import type { Communication } from '@medplum/fhirtypes';
import type { WithId } from '@medplum/core';
import { HomerSimpson, MockClient } from '@medplum/mock';
import { MedplumProvider } from '@medplum/react';
import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { describe, expect, test, vi, beforeEach } from 'vitest';
import { MessagesPage } from './MessagesPage';

vi.mock('@medplum/react-hooks', async () => {
  const actual = await vi.importActual('@medplum/react-hooks');
  return {
    ...actual,
    useSubscription: vi.fn(),
  };
});

describe('MessagesPage', () => {
  let medplum: MockClient;

  beforeEach(async () => {
    medplum = new MockClient();
    vi.clearAllMocks();
  });

  const setup = (messageId?: string): void => {
    const path = messageId ? `/Communication/${messageId}` : '/Communication';
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
      expect(screen.getByText('In progress')).toBeInTheDocument();
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

    const lastMessage: Communication = {
      resourceType: 'Communication',
      id: 'last-msg-123',
      status: 'in-progress',
      partOf: [{ reference: `Communication/${mockCommunication.id}` }],
      sent: '2024-01-01T12:00:00Z',
      payload: [{ contentString: 'Last message' }],
    };

    vi.spyOn(medplum, 'search').mockResolvedValue({
      resourceType: 'Bundle',
      type: 'searchset',
      total: 1,
      entry: [{ resource: mockCommunication as WithId<Communication> }],
    });

    vi.spyOn(medplum, 'graphql').mockResolvedValue({
      data: {
        thread_comm123: [lastMessage],
      },
    } as any);

    vi.spyOn(medplum, 'readResource').mockResolvedValue(mockCommunication as WithId<Communication>);

    setup('comm-123');

    await waitFor(
      () => {
        expect(screen.getByText('In progress')).toBeInTheDocument();
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
