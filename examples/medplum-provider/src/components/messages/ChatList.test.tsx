// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { MantineProvider } from '@mantine/core';
import type { Communication, Patient } from '@medplum/fhirtypes';
import { MockClient } from '@medplum/mock';
import { MedplumProvider } from '@medplum/react';
import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { describe, expect, test, vi, beforeEach } from 'vitest';
import { ChatList } from './ChatList';

const mockPatient1: Patient = {
  resourceType: 'Patient',
  id: 'patient-1',
  name: [{ given: ['John'], family: 'Doe' }],
};

const mockPatient2: Patient = {
  resourceType: 'Patient',
  id: 'patient-2',
  name: [{ given: ['Jane'], family: 'Smith' }],
};

const mockCommunication1: Communication = {
  resourceType: 'Communication',
  id: 'comm-1',
  status: 'in-progress',
  topic: { text: 'Topic 1' },
  subject: { reference: 'Patient/patient-1' },
};

const mockCommunication2: Communication = {
  resourceType: 'Communication',
  id: 'comm-2',
  status: 'in-progress',
  topic: { text: 'Topic 2' },
  subject: { reference: 'Patient/patient-2' },
};

const mockLastCommunication1: Communication = {
  resourceType: 'Communication',
  id: 'last-comm-1',
  status: 'in-progress',
  payload: [{ contentString: 'Last message 1' }],
  sent: '2024-01-01T12:00:00Z',
};

const mockGetThreadUri = vi.fn((topic: Communication) => `/Message/${topic.id}`);

describe('ChatList', () => {
  let medplum: MockClient;

  beforeEach(async () => {
    medplum = new MockClient();
    vi.clearAllMocks();

    // Create patient resources
    await medplum.createResource(mockPatient1);
    await medplum.createResource(mockPatient2);
  });

  const setup = (
    threads: [Communication, Communication | undefined][],
    selectedCommunication?: Communication
  ): void => {
    render(
      <MemoryRouter>
        <MedplumProvider medplum={medplum}>
          <MantineProvider>
            <ChatList threads={threads} selectedCommunication={selectedCommunication} getThreadUri={mockGetThreadUri} />
          </MantineProvider>
        </MedplumProvider>
      </MemoryRouter>
    );
  };

  test('renders empty list when no threads', () => {
    setup([]);
    expect(screen.queryByText('John Doe')).not.toBeInTheDocument();
  });

  test('renders single thread', async () => {
    setup([[mockCommunication1, mockLastCommunication1]]);
    await waitFor(() => {
      expect(screen.getByText('John Doe')).toBeInTheDocument();
    });
    expect(screen.getByText('Topic 1')).toBeInTheDocument();
  });

  test('renders multiple threads', async () => {
    setup([
      [mockCommunication1, mockLastCommunication1],
      [mockCommunication2, undefined],
    ]);
    await waitFor(() => {
      expect(screen.getByText('John Doe')).toBeInTheDocument();
      expect(screen.getByText('Jane Smith')).toBeInTheDocument();
    });
  });

  test('renders thread with last communication message', async () => {
    setup([[mockCommunication1, mockLastCommunication1]]);
    await waitFor(() => {
      expect(screen.getByText('John Doe')).toBeInTheDocument();
    });
    // When topic has text, it shows the topic text instead of message content
    expect(screen.getByText('Topic 1')).toBeInTheDocument();
  });

  test('handles thread without last communication', async () => {
    setup([[mockCommunication1, undefined]]);
    await waitFor(() => {
      expect(screen.getByText('John Doe')).toBeInTheDocument();
    });
    // When topic has text, it shows the topic text instead of "No messages available"
    expect(screen.getByText('Topic 1')).toBeInTheDocument();
  });

  test('renders link with correct href from getThreadUri', async () => {
    setup([[mockCommunication1, mockLastCommunication1]]);
    await waitFor(() => {
      const link = screen.getByText('John Doe').closest('a');
      expect(link).toHaveAttribute('href', '/Message/comm-1');
    });
  });
});
